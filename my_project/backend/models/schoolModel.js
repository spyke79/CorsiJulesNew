const db = require('../config/db');

/**
 * Creates a new school and optionally its associated plessi within a transaction.
 * @param {object} schoolData Contains school details (school_name, address, etc.)
 * @param {Array<object_or_string>} [plessiDataArray] Optional array of plesso objects or names.
 *        If string, it's treated as plesso_name with null address.
 *        If object, it should have { plesso_name, address }.
 * @returns {Promise<object>} The newly created school object, including its plessi.
 */
async function createSchool(schoolData, plessiDataArray = []) {
  const { school_name, address, contact_person, contact_email, contact_phone } = schoolData;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const schoolInsertQuery = `
      INSERT INTO schools (school_name, address, contact_person, contact_email, contact_phone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const schoolResult = await client.query(schoolInsertQuery, [
      school_name, address, contact_person, contact_email, contact_phone
    ]);
    const newSchool = schoolResult.rows[0];

    const plessi = [];
    if (plessiDataArray && plessiDataArray.length > 0) {
      const plessoInsertQuery = `
        INSERT INTO plessi (school_id, plesso_name, address)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
      for (const plessoData of plessiDataArray) {
        let plessoName, plessoAddress;
        if (typeof plessoData === 'string') {
          plessoName = plessoData;
          plessoAddress = null;
        } else {
          plessoName = plessoData.plesso_name;
          plessoAddress = plessoData.address;
        }
        const plessoResult = await client.query(plessoInsertQuery, [newSchool.school_id, plessoName, plessoAddress]);
        plessi.push(plessoResult.rows[0]);
      }
    }
    newSchool.plessi = plessi;

    await client.query('COMMIT');
    return newSchool;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating school:', error);
    if (error.code === '23505' && error.constraint === 'schools_school_name_key') {
        throw new Error('School with this name already exists.');
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieves all schools, optionally filtering by name.
 * @param {object} filters Contains optional filters like 'nameSearch'.
 * @returns {Promise<Array<object>>} A list of school objects.
 */
async function getAllSchools(filters = {}) {
  let queryText = 'SELECT * FROM schools';
  const queryParams = [];
  const conditions = [];

  if (filters.nameSearch) {
    queryParams.push(`%${filters.nameSearch}%`);
    conditions.push(`school_name ILIKE $${queryParams.length}`);
  }
  // Add other filters here if needed, e.g., by municipality if it were a separate field

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }
  queryText += ' ORDER BY school_name;';

  try {
    const { rows } = await db.query(queryText, queryParams);
    return rows;
  } catch (error) {
    console.error('Error getting all schools:', error);
    throw error;
  }
}

/**
 * Retrieves a single school by its ID, including its associated plessi.
 * @param {number} schoolId The ID of the school.
 * @returns {Promise<object|null>} The school object with plessi, or null if not found.
 */
async function getSchoolById(schoolId) {
  const schoolQuery = 'SELECT * FROM schools WHERE school_id = $1;';
  const plessiQuery = 'SELECT * FROM plessi WHERE school_id = $1 ORDER BY plesso_name;';

  try {
    const schoolResult = await db.query(schoolQuery, [schoolId]);
    if (schoolResult.rows.length === 0) {
      return null;
    }
    const school = schoolResult.rows[0];

    const plessiResult = await db.query(plessiQuery, [schoolId]);
    school.plessi = plessiResult.rows;

    return school;
  } catch (error) {
    console.error('Error getting school by ID:', error);
    throw error;
  }
}

/**
 * Updates an existing school's details and manages its plessi.
 * @param {number} schoolId The ID of the school to update.
 * @param {object} schoolData Contains school details to update.
 * @param {Array<object_or_string>} [plessiDataArray] Array of plesso data.
 *        Plessi not in this array might be removed (or handle updates based on ID).
 *        For simplicity, this example might remove existing plessi and add new ones.
 *        A more robust solution would compare existing plessi and update/add/delete accordingly.
 * @returns {Promise<object|null>} The updated school object with plessi, or null if not found.
 */
async function updateSchool(schoolId, schoolData, plessiDataArray = []) {
  const { school_name, address, contact_person, contact_email, contact_phone } = schoolData;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const schoolUpdateQuery = `
      UPDATE schools
      SET school_name = $1, address = $2, contact_person = $3, contact_email = $4, contact_phone = $5, updated_at = CURRENT_TIMESTAMP
      WHERE school_id = $6
      RETURNING *;
    `;
    const schoolResult = await client.query(schoolUpdateQuery, [
      school_name, address, contact_person, contact_email, contact_phone, schoolId
    ]);

    if (schoolResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return null; // School not found
    }
    const updatedSchool = schoolResult.rows[0];

    // Manage Plessi: For simplicity, remove existing and add new ones.
    // A more sophisticated approach would involve diffing and performing targeted CRUD on plessi.
    await client.query('DELETE FROM plessi WHERE school_id = $1;', [schoolId]);

    const plessi = [];
    if (plessiDataArray && plessiDataArray.length > 0) {
      const plessoInsertQuery = `
        INSERT INTO plessi (school_id, plesso_name, address)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
      for (const plessoData of plessiDataArray) {
        let plessoName, plessoAddress;
        if (typeof plessoData === 'string') {
          plessoName = plessoData;
          plessoAddress = null;
        } else {
          plessoName = plessoData.plesso_name;
          plessoAddress = plessoData.address;
        }
        // Ensure plessoName is not empty or null before inserting
        if (plessoName && plessoName.trim() !== '') {
            const plessoResult = await client.query(plessoInsertQuery, [updatedSchool.school_id, plessoName, plessoAddress]);
            plessi.push(plessoResult.rows[0]);
        }
      }
    }
    updatedSchool.plessi = plessi;

    await client.query('COMMIT');
    return updatedSchool;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating school:', error);
     if (error.code === '23505' && error.constraint === 'schools_school_name_key') {
        throw new Error('Another school with this name already exists.');
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes a school by its ID. Associated plessi are deleted by ON DELETE CASCADE.
 * @param {number} schoolId The ID of the school to delete.
 * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
 */
async function deleteSchool(schoolId) {
  try {
    // Plessi are deleted automatically due to ON DELETE CASCADE
    const result = await db.query('DELETE FROM schools WHERE school_id = $1 RETURNING *;', [schoolId]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting school:', error);
    // Handle specific errors, e.g., if school is referenced by projects and ON DELETE RESTRICT is used there.
    // For now, init.sql uses ON DELETE CASCADE for projects.school_id, so this should be fine.
    throw error;
  }
}

module.exports = {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
};
