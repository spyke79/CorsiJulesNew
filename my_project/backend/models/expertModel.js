const db = require('../config/db');
const { hashPassword } = require('../utils/passwordUtils'); // Assuming passwordUtils.js exists

/**
 * Creates a new user with 'Esperto' role and an associated expert record.
 * Manages expert_subjects associations transactionally.
 * @param {object} userData (first_name, last_name, email, password, is_active)
 * @param {object} expertData (cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled)
 * @param {Array<number>} subjectIds Array of subject IDs to associate with the expert.
 * @returns {Promise<object>} The newly created expert object with user details.
 */
async function createExpert(userData, expertData, subjectIds = []) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Get 'Esperto' role_id
    const roleResult = await client.query("SELECT role_id FROM roles WHERE role_name = 'Esperto'");
    if (roleResult.rows.length === 0) {
      throw new Error("Role 'Esperto' not found.");
    }
    const espertoRoleId = roleResult.rows[0].role_id;

    // 2. Create User record
    const hashedPassword = await hashPassword(userData.password);
    const userInsertQuery = `
      INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING user_id, first_name, last_name, email, is_active;
    `;
    const userResult = await client.query(userInsertQuery, [
      userData.first_name, userData.last_name, userData.email, hashedPassword, espertoRoleId, expertData.is_enabled // Link user.is_active to expert.is_enabled
    ]);
    const newUser = userResult.rows[0];

    // 3. Create Expert record
    const expertInsertQuery = `
      INSERT INTO experts (user_id, cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING expert_id, cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled;
    `;
    const expertResult = await client.query(expertInsertQuery, [
      newUser.user_id, expertData.cv_path, expertData.availability, expertData.codice_fiscale,
      expertData.address, expertData.pec, expertData.fiscal_regime, expertData.is_enabled
    ]);
    const newExpertDetails = expertResult.rows[0];

    // 4. Associate subjects with expert
    if (subjectIds && subjectIds.length > 0) {
      const subjectInsertPromises = subjectIds.map(subjectId => {
        return client.query(
          'INSERT INTO expert_subjects (expert_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
          [newExpertDetails.expert_id, subjectId]
        );
      });
      await Promise.all(subjectInsertPromises);
    }

    await client.query('COMMIT');
    return { ...newUser, ...newExpertDetails };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating expert:', error);
    if (error.code === '23505') { // Unique violation
        if (error.constraint === 'users_email_key') throw new Error('Email already exists for a user.');
        if (error.constraint === 'experts_user_id_key') throw new Error('This user is already registered as an expert.');
        // Add other unique constraints if necessary
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieves all experts with filtering and searching.
 * @param {object} filters (nameSearch, subjectId)
 * @returns {Promise<Array<object>>} List of experts.
 */
async function getAllExperts(filters = {}) {
  let queryText = `
    SELECT DISTINCT e.expert_id, u.user_id, u.first_name, u.last_name, u.email, u.is_active,
           e.cv_path, e.availability, e.codice_fiscale, e.address AS expert_address, e.pec, e.fiscal_regime, e.is_enabled,
           STRING_AGG(DISTINCT s.subject_name, ', ') AS subjects_taught
    FROM experts e
    JOIN users u ON e.user_id = u.user_id
    LEFT JOIN expert_subjects es ON e.expert_id = es.expert_id
    LEFT JOIN subjects s ON es.subject_id = s.subject_id
  `;
  const conditions = [];
  const queryParams = [];

  if (filters.nameSearch) {
    queryParams.push(`%${filters.nameSearch}%`);
    conditions.push(`(u.first_name ILIKE $${queryParams.length} OR u.last_name ILIKE $${queryParams.length} OR u.email ILIKE $${queryParams.length})`);
  }
  if (filters.subjectId) {
    queryParams.push(filters.subjectId);
    // This requires e.expert_id to be in a subquery or for the main query to filter by subjectId presence in expert_subjects
    conditions.push(`e.expert_id IN (SELECT es_sub.expert_id FROM expert_subjects es_sub WHERE es_sub.subject_id = $${queryParams.length})`);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }
  queryText += `
    GROUP BY e.expert_id, u.user_id
    ORDER BY u.last_name, u.first_name;
  `;

  try {
    const { rows } = await db.query(queryText, queryParams);
    return rows;
  } catch (error) {
    console.error('Error getting all experts:', error);
    throw error;
  }
}

/**
 * Retrieves a single expert by their expert_id.
 * Includes subjects and associated courses with payment status.
 * @param {number} expertId The ID of the expert (experts.expert_id).
 * @returns {Promise<object|null>} Expert object or null.
 */
async function getExpertById(expertId) {
  const expertQuery = `
    SELECT e.expert_id, u.user_id, u.first_name, u.last_name, u.email, u.is_active, u.role_id,
           e.cv_path, e.availability, e.codice_fiscale, e.address AS expert_address, e.pec, e.fiscal_regime, e.is_enabled,
           (SELECT r.role_name FROM roles r WHERE r.role_id = u.role_id) as role_name,
           COALESCE(json_agg(DISTINCT s.*) FILTER (WHERE s.subject_id IS NOT NULL), '[]') AS subjects
    FROM experts e
    JOIN users u ON e.user_id = u.user_id
    LEFT JOIN expert_subjects es ON e.expert_id = es.expert_id
    LEFT JOIN subjects s ON es.subject_id = s.subject_id
    WHERE e.expert_id = $1
    GROUP BY e.expert_id, u.user_id;
  `;
  const coursesQuery = `
    SELECT c.course_id, c.course_name, c.status AS course_status,
           p.project_name, sch.school_name,
           ce.hourly_cost, ce.payment_status
    FROM course_experts ce
    JOIN courses c ON ce.course_id = c.course_id
    JOIN projects p ON c.project_id = p.project_id
    JOIN schools sch ON p.school_id = sch.school_id
    WHERE ce.expert_id = $1
    ORDER BY c.start_date DESC;
  `;
  try {
    const expertResult = await db.query(expertQuery, [expertId]);
    if (expertResult.rows.length === 0) return null;
    const expert = expertResult.rows[0];

    const coursesResult = await db.query(coursesQuery, [expertId]);
    expert.associated_courses = coursesResult.rows;

    return expert;
  } catch (error) {
    console.error('Error getting expert by ID:', error);
    throw error;
  }
}

/**
 * Updates an expert's details in users and experts tables.
 * Manages expert_subjects associations transactionally.
 * @param {number} expertId (experts.expert_id)
 * @param {object} userData (first_name, last_name, email, is_active) - password handled separately
 * @param {object} expertData (cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled)
 * @param {Array<number>} subjectIds Array of subject IDs for the expert.
 * @returns {Promise<object|null>} The updated expert object.
 */
async function updateExpert(expertId, userData, expertData, subjectIds = []) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Get user_id from expert_id
    const expertUserLink = await client.query('SELECT user_id FROM experts WHERE expert_id = $1', [expertId]);
    if (expertUserLink.rows.length === 0) {
      throw new Error('Expert not found.');
    }
    const userId = expertUserLink.rows[0].user_id;

    // 2. Update User record
    // Note: Password update is separate. is_active is linked to expertData.is_enabled.
    const userUpdateQuery = `
      UPDATE users SET first_name = $1, last_name = $2, email = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $5
      RETURNING user_id, first_name, last_name, email, is_active;
    `;
    const userResult = await client.query(userUpdateQuery, [
      userData.first_name, userData.last_name, userData.email, expertData.is_enabled, userId
    ]);
    const updatedUser = userResult.rows[0];

    // 3. Update Expert record
    const expertUpdateQuery = `
      UPDATE experts SET cv_path = $1, availability = $2, codice_fiscale = $3, address = $4,
                         pec = $5, fiscal_regime = $6, is_enabled = $7, updated_at = CURRENT_TIMESTAMP
      WHERE expert_id = $8
      RETURNING expert_id, cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled;
    `;
    const expertResult = await client.query(expertUpdateQuery, [
      expertData.cv_path, expertData.availability, expertData.codice_fiscale, expertData.address,
      expertData.pec, expertData.fiscal_regime, expertData.is_enabled, expertId
    ]);
    const updatedExpertDetails = expertResult.rows[0];

    // 4. Update expert_subjects associations: Delete existing, then add new ones.
    await client.query('DELETE FROM expert_subjects WHERE expert_id = $1;', [expertId]);
    if (subjectIds && subjectIds.length > 0) {
      const subjectInsertPromises = subjectIds.map(subjectId => {
        return client.query(
          'INSERT INTO expert_subjects (expert_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
          [expertId, subjectId]
        );
      });
      await Promise.all(subjectInsertPromises);
    }

    await client.query('COMMIT');
    const finalExpert = await getExpertById(expertId); // Fetch full details again
    return finalExpert;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating expert:', error);
    if (error.code === '23505' && error.constraint === 'users_email_key') {
        throw new Error('Email already exists for another user.');
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes an expert (experts record). The corresponding users record is deleted by ON DELETE CASCADE.
 * @param {number} expertId The ID of the expert to delete.
 * @returns {Promise<boolean>} True if deletion was successful.
 */
async function deleteExpert(expertId) {
  // The users record is deleted via ON DELETE CASCADE from experts.user_id
  // expert_subjects are deleted via ON DELETE CASCADE from experts.expert_id
  // course_experts have ON DELETE RESTRICT on experts.expert_id - this needs to be handled.
  // For now, we assume admin must manually unassign expert from courses before deleting.
  // Or, we can check here and throw error.
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const courseAssignments = await client.query('SELECT course_id FROM course_experts WHERE expert_id = $1', [expertId]);
    if (courseAssignments.rows.length > 0) {
      await client.query('ROLLBACK'); // Release client before throwing error
      client.release();
      throw new Error(`Expert is still assigned to courses (e.g., course ID ${courseAssignments.rows[0].course_id}). Please unassign before deleting.`);
    }

    // Get user_id for the expert
    const userLink = await client.query('SELECT user_id FROM experts WHERE expert_id = $1;', [expertId]);
    if (userLink.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return false; // Expert not found
    }
    const userIdToDelete = userLink.rows[0].user_id;

    // Delete the user record; ON DELETE CASCADE on experts.user_id will remove the expert record
    const result = await client.query('DELETE FROM users WHERE user_id = $1 RETURNING *;', [userIdToDelete]);

    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting expert:', error);
    throw error; // Rethrow to be caught by controller
  } finally {
    client.release();
  }
}


/**
 * Retrieves all lessons for a specific expert within a date range.
 * @param {number} expertId
 * @param {object} dateRange { startDate, endDate } (optional)
 * @returns {Promise<Array<object>>}
 */
async function getExpertOverallCalendar(expertId, dateRange = {}) {
  let queryText = `
    SELECT cl.lesson_id, cl.lesson_title, cl.start_time, cl.end_time,
           c.course_name, s.school_name, p.plesso_name AS plesso_name, cl.location_details
    FROM calendar_lessons cl
    JOIN lesson_experts le ON cl.lesson_id = le.lesson_id
    JOIN course_experts ce ON le.course_expert_id = ce.course_expert_id
    JOIN courses c ON cl.course_id = c.course_id
    JOIN projects prj ON c.project_id = prj.project_id
    JOIN schools s ON prj.school_id = s.school_id
    LEFT JOIN plessi p ON cl.plesso_id = p.plesso_id
    WHERE ce.expert_id = $1
  `;
  const queryParams = [expertId];
  if (dateRange.startDate) {
    queryParams.push(dateRange.startDate);
    queryText += ` AND DATE(cl.start_time AT TIME ZONE 'UTC') >= $${queryParams.length}`;
  }
  if (dateRange.endDate) {
    queryParams.push(dateRange.endDate);
    queryText += ` AND DATE(cl.start_time AT TIME ZONE 'UTC') <= $${queryParams.length}`;
  }
  queryText += ' ORDER BY cl.start_time;';

  try {
    const { rows } = await db.query(queryText, queryParams);
    return rows.map(r => ({ ...r, lesson_date: new Date(r.start_time).toISOString().split('T')[0] }));
  } catch (error) {
    console.error('Error getting expert overall calendar:', error);
    throw error;
  }
}

/**
 * Retrieves all available subjects.
 * @returns {Promise<Array<object>>}
 */
async function getSubjects() {
  try {
    const { rows } = await db.query('SELECT * FROM subjects ORDER BY subject_name;');
    return rows;
  } catch (error) {
    console.error('Error getting subjects:', error);
    throw error;
  }
}

/**
 * Adds a new subject if it doesn't already exist.
 * @param {string} subjectName
 * @returns {Promise<object>} The new or existing subject.
 */
async function addSubject(subjectName, description = null) {
  try {
    // Check if subject exists
    const existing = await db.query('SELECT * FROM subjects WHERE subject_name ILIKE $1;', [subjectName]);
    if (existing.rows.length > 0) {
      return { ...existing.rows[0], status: 'existing' };
    }
    // Insert new subject
    const { rows } = await db.query(
      'INSERT INTO subjects (subject_name, description) VALUES ($1, $2) RETURNING *;',
      [subjectName, description]
    );
    return { ...rows[0], status: 'created' };
  } catch (error) {
    console.error('Error adding subject:', error);
    if (error.code === '23505') throw new Error('Subject already exists (concurrent creation attempt).');
    throw error;
  }
}


module.exports = {
  createExpert,
  getAllExperts,
  getExpertById,
  updateExpert,
  deleteExpert,
  getExpertOverallCalendar,
  getSubjects,
  addSubject,
  getExpertsList,
  getCoursesForExpert,
  getExpertDetailsByUserId, // Added helper
};

/**
 * Retrieves a simplified list of all active experts for selection UI.
 * (Mirrors the function previously in courseModel that called this)
 * @returns {Promise<Array<object>>} A list of experts with id, name, and email.
 */
async function getExpertsList() {
    const queryText = `
        SELECT e.expert_id, u.first_name, u.last_name, u.email
        FROM experts e
        JOIN users u ON e.user_id = u.user_id
        WHERE u.is_active = TRUE AND e.is_enabled = TRUE
        ORDER BY u.last_name, u.first_name;
    `;
    try {
        const { rows } = await db.query(queryText);
        return rows;
    } catch (error) {
        console.error('Error fetching simplified experts list:', error);
        throw error;
    }
}

/**
 * Retrieves all courses associated with a specific expert.
 * @param {number} expertId The ID of the expert (experts.expert_id).
 * @returns {Promise<Array<object>>} An array of course objects with selected details.
 */
async function getCoursesForExpert(expertId) {
  const queryText = `
    SELECT
      c.course_id,
      c.course_name,
      c.description AS course_description,
      c.duration_hours,
      c.status AS course_status,
      c.start_date AS course_start_date,
      c.end_date AS course_end_date,
      p.project_id,
      p.project_name,
      EXTRACT(YEAR FROM p.start_date) AS project_year, -- Derive year from project start_date
      s.school_id,
      s.school_name,
      ce.hourly_cost, -- Specific to this expert's assignment to this course
      ce.payment_status -- Specific to this expert's assignment to this course
    FROM course_experts ce
    JOIN courses c ON ce.course_id = c.course_id
    JOIN projects p ON c.project_id = p.project_id
    JOIN schools s ON p.school_id = s.school_id
    WHERE ce.expert_id = $1
    ORDER BY p.start_date DESC, c.start_date DESC;
  `;
  try {
    const { rows } = await db.query(queryText, [expertId]);
    return rows;
  } catch (error) {
    console.error(`Error fetching courses for expert ID ${expertId}:`, error);
    throw error;
  }
}

/**
 * Retrieves expert details based on a user ID.
 * @param {number} userId The user ID.
 * @returns {Promise<object|null>} The expert object or null if not found.
 */
async function getExpertDetailsByUserId(userId) {
  const queryText = `
    SELECT e.*, u.first_name, u.last_name, u.email
    FROM experts e
    JOIN users u ON e.user_id = u.user_id
    WHERE e.user_id = $1;
  `;
  try {
    const { rows } = await db.query(queryText, [userId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error(`Error fetching expert details for user ID ${userId}:`, error);
    throw error;
  }
}
