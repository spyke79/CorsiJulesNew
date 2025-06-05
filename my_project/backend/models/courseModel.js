const db = require('../config/db');

/**
 * Creates a new course, its expert assignments, and tutor assignments within a transaction.
 * @param {object} courseData Contains project_id, course_name, description, etc.
 * @param {Array<{expert_id: number, hourly_cost: number}>} expertsData Array of expert assignments.
 * @param {Array<{tutor_name: string, tutor_email?: string}>} tutorsData Array of tutor assignments.
 * @returns {Promise<object>} The newly created course object with its experts and tutors.
 */
async function createCourse(courseData, expertsData = [], tutorsData = []) {
  const { project_id, course_name, description, start_date, end_date, status } = courseData;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Insert into courses table
    const courseInsertQuery = `
      INSERT INTO courses (project_id, course_name, description, start_date, end_date, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const courseResult = await client.query(courseInsertQuery, [
      project_id, course_name, description, start_date, end_date, status || 'Scheduled'
    ]);
    const newCourse = courseResult.rows[0];

    // Insert into course_experts
    const assignedExperts = [];
    if (expertsData && expertsData.length > 0) {
      const expertInsertQuery = `
        INSERT INTO course_experts (course_id, expert_id, hourly_cost, payment_status)
        VALUES ($1, $2, $3, 'Pending')
        RETURNING course_expert_id, expert_id, hourly_cost, payment_status;
      `;
      for (const expert of expertsData) {
        const expertResult = await client.query(expertInsertQuery, [newCourse.course_id, expert.expert_id, expert.hourly_cost]);
        assignedExperts.push(expertResult.rows[0]);
      }
    }
    newCourse.experts = assignedExperts;

    // Insert into course_tutors
    const assignedTutors = [];
    if (tutorsData && tutorsData.length > 0) {
      const tutorInsertQuery = `
        INSERT INTO course_tutors (course_id, tutor_name, tutor_email)
        VALUES ($1, $2, $3)
        RETURNING course_tutor_id, tutor_name, tutor_email;
      `;
      for (const tutor of tutorsData) {
        const tutorResult = await client.query(tutorInsertQuery, [newCourse.course_id, tutor.tutor_name, tutor.tutor_email]);
        assignedTutors.push(tutorResult.rows[0]);
      }
    }
    newCourse.tutors = assignedTutors;

    await client.query('COMMIT');
    return newCourse;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating course:', error);
    if (error.code === '23503') { // Foreign key violation
        if (error.constraint === 'courses_project_id_fkey') {
            throw new Error('Project not found for this course.');
        }
        if (error.constraint === 'course_experts_expert_id_fkey') {
            throw new Error('One or more experts assigned to the course not found.');
        }
    }
    throw error;
  } finally {
    client.release();
  }
}


/**
 * Retrieves all courses for a given project_id, including their assigned experts and tutors.
 * @param {number} projectId The ID of the project.
 * @returns {Promise<Array<object>>} A list of course objects with details.
 */
async function getCoursesByProjectId(projectId) {
  const queryText = `
    SELECT c.*,
           COALESCE(json_agg(DISTINCT jsonb_build_object(
             'course_expert_id', ce.course_expert_id,
             'expert_id', e.expert_id,
             'first_name', u.first_name,
             'last_name', u.last_name,
             'email', u.email,
             'hourly_cost', ce.hourly_cost,
             'payment_status', ce.payment_status
           )) FILTER (WHERE e.expert_id IS NOT NULL), '[]') AS experts,
           COALESCE(json_agg(DISTINCT jsonb_build_object(
             'course_tutor_id', ct.course_tutor_id,
             'tutor_name', ct.tutor_name,
             'tutor_email', ct.tutor_email
           )) FILTER (WHERE ct.course_tutor_id IS NOT NULL), '[]') AS tutors
    FROM courses c
    LEFT JOIN course_experts ce ON c.course_id = ce.course_id
    LEFT JOIN experts e ON ce.expert_id = e.expert_id
    LEFT JOIN users u ON e.user_id = u.user_id
    LEFT JOIN course_tutors ct ON c.course_id = ct.course_id
    WHERE c.project_id = $1
    GROUP BY c.course_id
    ORDER BY c.start_date, c.course_name;
  `;
  try {
    const { rows } = await db.query(queryText, [projectId]);
    return rows;
  } catch (error) {
    console.error('Error getting courses by project ID:', error);
    throw error;
  }
}

/**
 * Retrieves a single course by its ID, including its experts and tutors.
 * @param {number} courseId The ID of the course.
 * @returns {Promise<object|null>} The course object with details, or null if not found.
 */
async function getCourseById(courseId) {
 const queryText = `
    SELECT c.*,
           p.project_name, -- Include project name
           s.school_name,  -- Include school name
           COALESCE(json_agg(DISTINCT jsonb_build_object(
             'course_expert_id', ce.course_expert_id,
             'expert_id', e.expert_id,
             'first_name', u.first_name,
             'last_name', u.last_name,
             'email', u.email,
             'hourly_cost', ce.hourly_cost,
             'payment_status', ce.payment_status
           )) FILTER (WHERE e.expert_id IS NOT NULL), '[]') AS experts,
           COALESCE(json_agg(DISTINCT jsonb_build_object(
             'course_tutor_id', ct.course_tutor_id,
             'tutor_name', ct.tutor_name,
             'tutor_email', ct.tutor_email
           )) FILTER (WHERE ct.course_tutor_id IS NOT NULL), '[]') AS tutors
    FROM courses c
    JOIN projects p ON c.project_id = p.project_id
    JOIN schools s ON p.school_id = s.school_id
    LEFT JOIN course_experts ce ON c.course_id = ce.course_id
    LEFT JOIN experts e ON ce.expert_id = e.expert_id
    LEFT JOIN users u ON e.user_id = u.user_id
    LEFT JOIN course_tutors ct ON c.course_id = ct.course_id
    WHERE c.course_id = $1
    GROUP BY c.course_id, p.project_name, s.school_name;
  `;
  try {
    const { rows } = await db.query(queryText, [courseId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error getting course by ID:', error);
    throw error;
  }
}

/**
 * Updates an existing course, its expert assignments, and tutor assignments within a transaction.
 * @param {number} courseId The ID of the course to update.
 * @param {object} courseData Contains course details to update.
 * @param {Array<{expert_id: number, hourly_cost: number}>} expertsData Array of new expert assignments.
 * @param {Array<{tutor_name: string, tutor_email?: string}>} tutorsData Array of new tutor assignments.
 * @returns {Promise<object|null>} The updated course object with details, or null if not found.
 */
async function updateCourse(courseId, courseData, expertsData = [], tutorsData = []) {
  const { project_id, course_name, description, start_date, end_date, status } = courseData;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Update courses table
    const courseUpdateQuery = `
      UPDATE courses
      SET project_id = $1, course_name = $2, description = $3, start_date = $4,
          end_date = $5, status = $6, updated_at = CURRENT_TIMESTAMP
      WHERE course_id = $7
      RETURNING *;
    `;
    const courseResult = await client.query(courseUpdateQuery, [
      project_id, course_name, description, start_date, end_date, status, courseId
    ]);

    if (courseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return null; // Course not found
    }
    const updatedCourse = courseResult.rows[0];

    // Update course_experts: Delete existing and insert new ones
    await client.query('DELETE FROM course_experts WHERE course_id = $1;', [courseId]);
    const assignedExperts = [];
    if (expertsData && expertsData.length > 0) {
      const expertInsertQuery = `
        INSERT INTO course_experts (course_id, expert_id, hourly_cost, payment_status)
        VALUES ($1, $2, $3, 'Pending')
        RETURNING course_expert_id, expert_id, hourly_cost, payment_status;
      `;
      for (const expert of expertsData) {
         // Ensure expert_id and hourly_cost are present
        if (expert.expert_id == null || expert.hourly_cost == null) {
            throw new Error('Expert ID and hourly cost are required for each expert.');
        }
        const expertResult = await client.query(expertInsertQuery, [courseId, expert.expert_id, expert.hourly_cost]);
        assignedExperts.push(expertResult.rows[0]);
      }
    }
    updatedCourse.experts = assignedExperts;

    // Update course_tutors: Delete existing and insert new ones
    await client.query('DELETE FROM course_tutors WHERE course_id = $1;', [courseId]);
    const assignedTutors = [];
    if (tutorsData && tutorsData.length > 0) {
      const tutorInsertQuery = `
        INSERT INTO course_tutors (course_id, tutor_name, tutor_email)
        VALUES ($1, $2, $3)
        RETURNING course_tutor_id, tutor_name, tutor_email;
      `;
      for (const tutor of tutorsData) {
        if (!tutor.tutor_name) {
            throw new Error('Tutor name is required for each tutor.');
        }
        const tutorResult = await client.query(tutorInsertQuery, [courseId, tutor.tutor_name, tutor.tutor_email]);
        assignedTutors.push(tutorResult.rows[0]);
      }
    }
    updatedCourse.tutors = assignedTutors;

    await client.query('COMMIT');
    return updatedCourse;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating course:', error);
    if (error.code === '23503') { // Foreign key violation
        if (error.constraint === 'courses_project_id_fkey') {
            throw new Error('Project not found for this course.');
        }
        if (error.constraint === 'course_experts_expert_id_fkey') {
            throw new Error('One or more experts assigned to the course not found.');
        }
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes a course by its ID.
 * Associated course_experts, course_tutors, calendar_lessons are deleted by ON DELETE CASCADE.
 * @param {number} courseId The ID of the course to delete.
 * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
 */
async function deleteCourse(courseId) {
  try {
    const result = await db.query('DELETE FROM courses WHERE course_id = $1 RETURNING *;', [courseId]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting course:', error);
    throw error;
  }
}

module.exports = {
  createCourse,
  getCoursesByProjectId,
  getCourseById,
  updateCourse,
  deleteCourse,
};
