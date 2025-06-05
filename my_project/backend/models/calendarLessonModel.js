const db = require('../config/db');

/**
 * Helper function to find expert conflicts.
 * Checks if any of the provided expert IDs are already scheduled for an overlapping lesson.
 * @param {Array<number>} expertIds Array of expert IDs associated with the course of the lesson being checked.
 * @param {string} lessonDate Date string 'YYYY-MM-DD'.
 * @param {string} startTime Time string 'HH:MI' or 'HH:MI:SS'.
 * @param {string} endTime Time string 'HH:MI' or 'HH:MI:SS'.
 * @param {number|null} excludingLessonId Optional lesson ID to exclude from the check (for updates).
 * @param {pg.Client|null} client Optional DB client for transactions.
 * @returns {Promise<Array<object>>} Array of conflicting lessons, if any.
 */
async function findExpertConflicts(expertIds, lessonDate, startTime, endTime, excludingLessonId = null, client = null) {
  if (!expertIds || expertIds.length === 0) {
    return [];
  }
  const queryRunner = client || db;
  const startTimestamp = `${lessonDate} ${startTime}`;
  const endTimestamp = `${lessonDate} ${endTime}`;
  let conflictQueryText = `
    SELECT cl.lesson_id, cl.lesson_title, cl.start_time, cl.end_time, u.first_name, u.last_name AS expert_name
    FROM calendar_lessons cl
    JOIN lesson_experts le ON cl.lesson_id = le.lesson_id
    JOIN course_experts ce ON le.course_expert_id = ce.course_expert_id
    JOIN experts e ON ce.expert_id = e.expert_id
    JOIN users u ON e.user_id = u.user_id
    WHERE ce.expert_id = ANY($1::int[])
      AND cl.start_time < $3::timestamptz
      AND cl.end_time > $2::timestamptz
  `;
  const queryParams = [expertIds, startTimestamp, endTimestamp];
  if (excludingLessonId !== null) {
    conflictQueryText += ` AND cl.lesson_id != $4`;
    queryParams.push(excludingLessonId);
  }
  try {
    const { rows } = await queryRunner.query(conflictQueryText, queryParams);
    return rows;
  } catch (error) {
    console.error('Error finding expert conflicts:', error);
    throw error;
  }
}

async function createLesson(lessonData) {
  const { course_id, lesson_title, lesson_description, lesson_date, start_time, end_time, plesso_id, location_details } = lessonData;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const courseExpertsResult = await client.query(
      'SELECT expert_id FROM course_experts WHERE course_id = $1;',
      [course_id]
    );
    const expertIds = courseExpertsResult.rows.map(row => row.expert_id);
    const conflicts = await findExpertConflicts(expertIds, lesson_date, start_time, end_time, null, client);
    if (conflicts.length > 0) {
      await client.query('ROLLBACK');
      return { error: 'conflict', conflicts, message: 'One or more experts are already scheduled for an overlapping lesson.' };
    }
    const fullStartTime = `${lesson_date} ${start_time}`;
    const fullEndTime = `${lesson_date} ${end_time}`;
    const lessonInsertQuery = `
      INSERT INTO calendar_lessons (course_id, plesso_id, lesson_title, lesson_description, start_time, end_time, location_details)
      VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7)
      RETURNING *;
    `;
    const lessonResult = await client.query(lessonInsertQuery, [
      course_id, plesso_id, lesson_title, lesson_description, fullStartTime, fullEndTime, location_details
    ]);
    const newLesson = lessonResult.rows[0];
    if (expertIds.length > 0) {
        const courseExpertEntries = await client.query(
            'SELECT course_expert_id FROM course_experts WHERE course_id = $1 AND expert_id = ANY($2::int[]);',
            [course_id, expertIds]
        );
        const lessonExpertInsertQuery = `
            INSERT INTO lesson_experts (lesson_id, course_expert_id) VALUES ($1, $2);
        `;
        for (const ce of courseExpertEntries.rows) {
            await client.query(lessonExpertInsertQuery, [newLesson.lesson_id, ce.course_expert_id]);
        }
    }
    await client.query('COMMIT');
    return getLessonById(newLesson.lesson_id, client);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating lesson:', error);
    if (error.code === '23503' && error.constraint === 'calendar_lessons_course_id_fkey') {
        throw new Error('Course not found for this lesson.');
    }
    if (error.code === '23503' && error.constraint === 'calendar_lessons_plesso_id_fkey') {
        throw new Error('Plesso not found for this lesson.');
    }
    if (error.code === '22007' || error.code === '22008') {
        throw new Error('Invalid date or time format provided.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function getLessonsByCourseId(courseId) {
  const queryText = `
    SELECT cl.*, p.plesso_name,
           COALESCE(
            STRING_AGG(DISTINCT u_expert.first_name || ' ' || u_expert.last_name, ', '),
            'N/A'
           ) AS expert_names
    FROM calendar_lessons cl
    LEFT JOIN plessi p ON cl.plesso_id = p.plesso_id
    LEFT JOIN lesson_experts le ON cl.lesson_id = le.lesson_id
    LEFT JOIN course_experts ce ON le.course_expert_id = ce.course_expert_id
    LEFT JOIN experts exp ON ce.expert_id = exp.expert_id
    LEFT JOIN users u_expert ON exp.user_id = u_expert.user_id
    WHERE cl.course_id = $1
    GROUP BY cl.lesson_id, p.plesso_name
    ORDER BY cl.start_time;
  `;
  try {
    const { rows } = await db.query(queryText, [courseId]);
    return rows;
  } catch (error) {
    console.error('Error getting lessons by course ID:', error);
    throw error;
  }
}

async function getLessonById(lessonId, client = null) {
  const queryRunner = client || db;
  const queryText = `
    SELECT cl.*, p.plesso_name,
           COALESCE(
            STRING_AGG(DISTINCT u_expert.first_name || ' ' || u_expert.last_name, ', '),
            'N/A'
           ) AS expert_names
    FROM calendar_lessons cl
    LEFT JOIN plessi p ON cl.plesso_id = p.plesso_id
    LEFT JOIN lesson_experts le ON cl.lesson_id = le.lesson_id
    LEFT JOIN course_experts ce ON le.course_expert_id = ce.course_expert_id
    LEFT JOIN experts exp ON ce.expert_id = exp.expert_id
    LEFT JOIN users u_expert ON exp.user_id = u_expert.user_id
    WHERE cl.lesson_id = $1
    GROUP BY cl.lesson_id, p.plesso_name;
  `;
  try {
    const { rows } = await queryRunner.query(queryText, [lessonId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error getting lesson by ID:', error);
    throw error;
  }
}

async function updateLesson(lessonId, lessonData) {
  const { course_id, lesson_title, lesson_description, lesson_date, start_time, end_time, plesso_id, location_details } = lessonData;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const currentLesson = await client.query('SELECT course_id FROM calendar_lessons WHERE lesson_id = $1', [lessonId]);
    if (currentLesson.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return null;
    }
    const finalCourseId = course_id || currentLesson.rows[0].course_id;
    const courseExpertsResult = await client.query(
      'SELECT expert_id FROM course_experts WHERE course_id = $1;',
      [finalCourseId]
    );
    const expertIds = courseExpertsResult.rows.map(row => row.expert_id);
    const conflicts = await findExpertConflicts(expertIds, lesson_date, start_time, end_time, lessonId, client);
    if (conflicts.length > 0) {
      await client.query('ROLLBACK');
      return { error: 'conflict', conflicts, message: 'One or more experts are already scheduled for an overlapping lesson.' };
    }
    const fullStartTime = `${lesson_date} ${start_time}`;
    const fullEndTime = `${lesson_date} ${end_time}`;
    const lessonUpdateQuery = `
      UPDATE calendar_lessons
      SET course_id = $1, plesso_id = $2, lesson_title = $3, lesson_description = $4,
          start_time = $5::timestamptz, end_time = $6::timestamptz, location_details = $7, updated_at = CURRENT_TIMESTAMP
      WHERE lesson_id = $8
      RETURNING *;
    `;
    const lessonResult = await client.query(lessonUpdateQuery, [
      finalCourseId, plesso_id, lesson_title, lesson_description, fullStartTime, fullEndTime, location_details, lessonId
    ]);
    if (lessonResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
    }
    if (course_id && course_id !== currentLesson.rows[0].course_id) {
        await client.query('DELETE FROM lesson_experts WHERE lesson_id = $1;', [lessonId]);
        if (expertIds.length > 0) {
            const courseExpertEntries = await client.query(
                'SELECT course_expert_id FROM course_experts WHERE course_id = $1 AND expert_id = ANY($2::int[]);',
                [finalCourseId, expertIds]
            );
            const lessonExpertInsertQuery = `INSERT INTO lesson_experts (lesson_id, course_expert_id) VALUES ($1, $2);`;
            for (const ce of courseExpertEntries.rows) {
                await client.query(lessonExpertInsertQuery, [lessonId, ce.course_expert_id]);
            }
        }
    }
    await client.query('COMMIT');
    return getLessonById(lessonId, client);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating lesson:', error);
    if (error.code === '23503') {
        if (error.constraint === 'calendar_lessons_course_id_fkey') {
            throw new Error('Course not found for this lesson.');
        }
        if (error.constraint === 'calendar_lessons_plesso_id_fkey') {
            throw new Error('Plesso not found for this lesson.');
        }
    }
    if (error.code === '22007' || error.code === '22008') {
        throw new Error('Invalid date or time format provided.');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function deleteLesson(lessonId) {
  try {
    const result = await db.query('DELETE FROM calendar_lessons WHERE lesson_id = $1 RETURNING *;', [lessonId]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting lesson:', error);
    throw error;
  }
}

async function getCourseScheduledHours(courseId) {
  const queryText = `
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0) AS total_hours
    FROM calendar_lessons
    WHERE course_id = $1;
  `;
  try {
    const { rows } = await db.query(queryText, [courseId]);
    return parseFloat(rows[0].total_hours) || 0;
  } catch (error) {
    console.error('Error calculating course scheduled hours:', error);
    throw error;
  }
}

/**
 * Retrieves detailed lessons for a specific course if the given expert is assigned to it.
 * @param {number} courseId The ID of the course.
 * @param {number} expertId The ID of the expert (experts.expert_id).
 * @returns {Promise<Array<object>|{error: string, message: string}>} Array of detailed lesson objects or an error object.
 */
async function getLessonsForCourseByExpert(courseId, expertId) {
  const assignmentCheckQuery = `
    SELECT 1 FROM course_experts
    WHERE course_id = $1 AND expert_id = $2;
  `;
  try {
    const assignmentResult = await db.query(assignmentCheckQuery, [courseId, expertId]);
    if (assignmentResult.rows.length === 0) {
      return {
        error: 'not_assigned',
        message: 'Expert is not assigned to this course.'
      };
    }
  } catch (error) {
    console.error('Error checking expert assignment:', error);
    throw error;
  }

  const lessonsQueryText = `
    SELECT
      cl.lesson_id,
      cl.lesson_title,
      cl.lesson_description,
      cl.start_time,
      cl.end_time,
      EXTRACT(EPOCH FROM (cl.end_time - cl.start_time)) / 3600 AS lesson_duration_hours,
      c.course_name AS course_title,
      s.school_name,
      COALESCE(pl.address, s.address) AS venue_address,
      COALESCE(pl.google_maps_link, s.google_maps_link) AS venue_google_maps_link,
      cl.location_details,
      p_details.plesso_name
    FROM calendar_lessons cl
    JOIN courses c ON cl.course_id = c.course_id
    JOIN projects prj ON c.project_id = prj.project_id
    JOIN schools s ON prj.school_id = s.school_id
    LEFT JOIN plessi pl ON cl.plesso_id = pl.plesso_id
    LEFT JOIN plessi p_details ON cl.plesso_id = p_details.plesso_id
    WHERE cl.course_id = $1
    ORDER BY cl.start_time;
  `;
  try {
    const { rows } = await db.query(lessonsQueryText, [courseId]);
    return rows.map(lesson => ({
        ...lesson,
        lesson_date: new Date(lesson.start_time).toISOString().split('T')[0],
        start_time_formatted: new Date(lesson.start_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
        end_time_formatted: new Date(lesson.end_time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
    }));
  } catch (error) {
    console.error(`Error fetching lessons for course ID ${courseId} by expert ID ${expertId}:`, error);
    throw error;
  }
}

module.exports = {
  createLesson,
  getLessonsByCourseId,
  getLessonById,
  updateLesson,
  deleteLesson,
  getCourseScheduledHours,
  findExpertConflicts,
  getLessonsForCourseByExpert,
};
