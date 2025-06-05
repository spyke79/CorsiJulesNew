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
    return []; // No experts assigned to the course, so no conflicts possible for them.
  }

  const queryRunner = client || db; // Use transaction client if provided

  // Construct full timestamp strings for query
  // Ensure lessonDate is treated as date, and time is combined correctly.
  // PostgreSQL can cast 'YYYY-MM-DD HH:MI:SS' to timestamp with time zone.
  // Assuming DB server timezone or session timezone handles conversion correctly if input is local.
  // For robustness, specify timezone if known, e.g., lessonDate + ' ' + startTime + ' Europe/Rome'
  const startTimestamp = `${lessonDate} ${startTime}`;
  const endTimestamp = `${lessonDate} ${endTime}`;

  // Query to find lessons taught by any of the specified experts that overlap with the given time slot
  // An overlap occurs if (ExistingStart < ProposedEnd) AND (ExistingEnd > ProposedStart)
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


/**
 * Creates a new lesson after checking for expert conflicts.
 * @param {object} lessonData Contains course_id, lesson_title, lesson_description, lesson_date, start_time, end_time, plesso_id?, location_details?
 * @returns {Promise<object>} The newly created lesson object or an error object with conflict info.
 */
async function createLesson(lessonData) {
  const { course_id, lesson_title, lesson_description, lesson_date, start_time, end_time, plesso_id, location_details } = lessonData;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Get expert_ids for the course
    const courseExpertsResult = await client.query(
      'SELECT expert_id FROM course_experts WHERE course_id = $1;',
      [course_id]
    );
    const expertIds = courseExpertsResult.rows.map(row => row.expert_id);

    // 2. Check for conflicts
    const conflicts = await findExpertConflicts(expertIds, lesson_date, start_time, end_time, null, client);
    if (conflicts.length > 0) {
      await client.query('ROLLBACK');
      // Custom error structure to indicate conflict
      return { error: 'conflict', conflicts, message: 'One or more experts are already scheduled for an overlapping lesson.' };
    }

    // 3. Insert the lesson
    // Combine date and time for start_time and end_time fields
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

    // 4. Automatically assign ALL experts of the course to this new lesson in lesson_experts
    // This is an assumption. If specific experts need to be chosen per lesson, the UI/request must provide them.
    // For now, if a lesson is created for a course, all course_experts associated with that course are linked to the lesson.
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
    // Refetch the lesson with expert details for consistent return structure (optional)
    return getLessonById(newLesson.lesson_id, client); // Pass client to reuse transaction if needed
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating lesson:', error);
    if (error.code === '23503' && error.constraint === 'calendar_lessons_course_id_fkey') {
        throw new Error('Course not found for this lesson.');
    }
    if (error.code === '23503' && error.constraint === 'calendar_lessons_plesso_id_fkey') {
        throw new Error('Plesso not found for this lesson.');
    }
    // Check for invalid timestamp format
    if (error.code === '22007' || error.code === '22008') { // invalid_datetime_format or datetime_field_overflow
        throw new Error('Invalid date or time format provided.');
    }
    throw error;
  } finally {
    client.release();
  }
}


/**
 * Retrieves all lessons for a given course_id, ordered by date and start time.
 * Includes plesso_name if plesso_id is present.
 * @param {number} courseId The ID of the course.
 * @returns {Promise<Array<object>>} A list of lesson objects.
 */
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

/**
 * Retrieves a single lesson by its ID.
 * @param {number} lessonId The ID of the lesson.
 * @param {pg.Client|null} client Optional DB client for transactions.
 * @returns {Promise<object|null>} The lesson object, or null if not found.
 */
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

/**
 * Updates an existing lesson after checking for expert conflicts.
 * @param {number} lessonId The ID of the lesson to update.
 * @param {object} lessonData Contains fields to update.
 * @returns {Promise<object|null>} The updated lesson object, or an error object with conflict info, or null if not found.
 */
async function updateLesson(lessonId, lessonData) {
  const { course_id, lesson_title, lesson_description, lesson_date, start_time, end_time, plesso_id, location_details } = lessonData;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Get current course_id if not provided (or to verify it if needed)
    // For simplicity, we'll assume course_id might change or is provided.
    // If course_id changes, expert conflict check must use new course's experts.
    const currentLesson = await client.query('SELECT course_id FROM calendar_lessons WHERE lesson_id = $1', [lessonId]);
    if (currentLesson.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return null; // Lesson not found
    }
    const finalCourseId = course_id || currentLesson.rows[0].course_id;


    // 2. Get expert_ids for the relevant course
    const courseExpertsResult = await client.query(
      'SELECT expert_id FROM course_experts WHERE course_id = $1;',
      [finalCourseId]
    );
    const expertIds = courseExpertsResult.rows.map(row => row.expert_id);

    // 3. Check for conflicts, excluding the current lesson being updated
    const conflicts = await findExpertConflicts(expertIds, lesson_date, start_time, end_time, lessonId, client);
    if (conflicts.length > 0) {
      await client.query('ROLLBACK');
      return { error: 'conflict', conflicts, message: 'One or more experts are already scheduled for an overlapping lesson.' };
    }

    // 4. Update the lesson
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

    if (lessonResult.rows.length === 0) { // Should not happen if previous check passed, but good practice
        await client.query('ROLLBACK');
        return null;
    }

    // If course_id changed, lesson_experts might need updating.
    // The current logic assumes all experts for the *new* course_id are assigned.
    // This might not be desired. For now, if course_id changes, this re-assigns all experts of the new course.
    // A more refined approach would be to explicitly pass which experts should be assigned.
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
    if (error.code === '23503') { // Foreign key violation
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


/**
 * Deletes a lesson by its ID.
 * @param {number} lessonId The ID of the lesson to delete.
 * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
 */
async function deleteLesson(lessonId) {
  try {
    // lesson_experts entries are cascaded by DB foreign key constraint
    const result = await db.query('DELETE FROM calendar_lessons WHERE lesson_id = $1 RETURNING *;', [lessonId]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting lesson:', error);
    throw error;
  }
}


/**
 * Calculates the total hours already scheduled for a given course.
 * @param {number} courseId The ID of the course.
 * @returns {Promise<number>} Total scheduled hours for the course.
 */
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


module.exports = {
  createLesson,
  getLessonsByCourseId,
  getLessonById,
  updateLesson,
  deleteLesson,
  getCourseScheduledHours,
  findExpertConflicts, // Exporting for potential direct use or testing
};
