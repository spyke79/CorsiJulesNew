const db = require('../config/db');
const fs = require('fs').promises; // For file system operations like deleting files
const path = require('path');

/**
 * Creates a new project.
 * @param {object} projectData Contains school_id, project_name, project_code, etc.
 * @returns {Promise<object>} The newly created project object.
 */
async function createProject(projectData) {
  const { school_id, project_name, project_code, description, start_date, end_date, status } = projectData;
  const queryText = `
    INSERT INTO projects (school_id, project_name, project_code, description, start_date, end_date, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
  try {
    const { rows } = await db.query(queryText, [
      school_id, project_name, project_code, description, start_date, end_date, status || 'Pending'
    ]);
    return rows[0];
  } catch (error) {
    console.error('Error creating project:', error);
    if (error.code === '23505' && error.constraint === 'projects_project_code_key') {
      throw new Error('Project with this code already exists.');
    }
    if (error.code === '23503' && error.constraint === 'projects_school_id_fkey') {
      throw new Error('School not found for this project.');
    }
    throw error;
  }
}

/**
 * Retrieves all projects for a given school_id.
 * @param {number} schoolId The ID of the school.
 * @returns {Promise<Array<object>>} A list of project objects.
 */
async function getProjectsBySchoolId(schoolId) {
  const queryText = 'SELECT * FROM projects WHERE school_id = $1 ORDER BY start_date DESC, project_name;';
  try {
    const { rows } = await db.query(queryText, [schoolId]);
    return rows;
  } catch (error) {
    console.error('Error getting projects by school ID:', error);
    throw error;
  }
}

/**
 * Retrieves a single project by its ID, including its associated documents.
 * @param {number} projectId The ID of the project.
 * @returns {Promise<object|null>} The project object with documents, or null if not found.
 */
async function getProjectById(projectId) {
  const projectQuery = 'SELECT * FROM projects WHERE project_id = $1;';
  const documentsQuery = 'SELECT * FROM project_documents WHERE project_id = $1 ORDER BY upload_date DESC;';
  try {
    const projectResult = await db.query(projectQuery, [projectId]);
    if (projectResult.rows.length === 0) {
      return null;
    }
    const project = projectResult.rows[0];
    const documentsResult = await db.query(documentsQuery, [projectId]);
    project.documents = documentsResult.rows;
    return project;
  } catch (error) {
    console.error('Error getting project by ID:', error);
    throw error;
  }
}

/**
 * Updates an existing project's details.
 * @param {number} projectId The ID of the project to update.
 * @param {object} projectData Contains fields to update.
 * @returns {Promise<object|null>} The updated project object, or null if not found.
 */
async function updateProject(projectId, projectData) {
  const { project_name, project_code, description, start_date, end_date, status, school_id } = projectData;
  // Note: Updating school_id might be complex if business rules restrict it. For now, allowing it.
  const queryText = `
    UPDATE projects
    SET school_id = $1, project_name = $2, project_code = $3, description = $4,
        start_date = $5, end_date = $6, status = $7, updated_at = CURRENT_TIMESTAMP
    WHERE project_id = $8
    RETURNING *;
  `;
  try {
    const { rows } = await db.query(queryText, [
      school_id, project_name, project_code, description, start_date, end_date, status, projectId
    ]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error updating project:', error);
    if (error.code === '23505' && error.constraint === 'projects_project_code_key') {
      throw new Error('Another project with this code already exists.');
    }
    if (error.code === '23503' && error.constraint === 'projects_school_id_fkey') {
      throw new Error('School not found for this project.');
    }
    throw error;
  }
}

/**
 * Deletes a project by its ID.
 * Associated documents and courses are deleted by ON DELETE CASCADE in the DB.
 * @param {number} projectId The ID of the project to delete.
 * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
 */
async function deleteProject(projectId) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // First, retrieve documents to delete their files
    const docsResult = await client.query('SELECT document_path FROM project_documents WHERE project_id = $1', [projectId]);

    // Delete project from DB (documents and courses will cascade)
    const deleteProjectResult = await client.query('DELETE FROM projects WHERE project_id = $1 RETURNING *;', [projectId]);

    if (deleteProjectResult.rowCount > 0) {
      // If project deleted, delete associated files
      for (const doc of docsResult.rows) {
        if (doc.document_path) {
          // Construct absolute path carefully. Assume document_path is relative to a base like 'uploads/'
          // For now, this assumes document_path is something like 'project_docs/project_123/file.pdf'
          // and the script runs from a directory where 'uploads' is a sibling or accessible.
          // A more robust solution uses an absolute base path from config.
          const fullPath = path.join(__dirname, '..', 'uploads', doc.document_path); // Adjust if path structure is different
          try {
            await fs.unlink(fullPath);
            console.log(`Deleted file: ${fullPath}`);
          } catch (fileError) {
            // Log error but don't let it stop transaction commit if DB entries are gone.
            // This could happen if file was already deleted or path is wrong.
            console.error(`Error deleting file ${fullPath}:`, fileError.message);
          }
        }
      }
      await client.query('COMMIT');
      return true;
    } else {
      await client.query('ROLLBACK');
      return false; // Project not found
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting project:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Adds a document record to project_documents.
 * @param {number} projectId The ID of the project.
 * @param {object} documentData Contains document_name, document_path.
 * @returns {Promise<object>} The newly created document object.
 */
async function addProjectDocument(projectId, documentData) {
  const { document_name, document_path } = documentData;
  const queryText = `
    INSERT INTO project_documents (project_id, document_name, document_path)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  try {
    const { rows } = await db.query(queryText, [projectId, document_name, document_path]);
    return rows[0];
  } catch (error) {
    console.error('Error adding project document:', error);
    if (error.code === '23503' && error.constraint === 'project_documents_project_id_fkey') {
      throw new Error('Project not found for this document.');
    }
    throw error;
  }
}

/**
 * Retrieves all documents for a project.
 * @param {number} projectId The ID of the project.
 * @returns {Promise<Array<object>>} A list of document objects.
 */
async function getProjectDocuments(projectId) {
  const queryText = 'SELECT * FROM project_documents WHERE project_id = $1 ORDER BY upload_date DESC;';
  try {
    const { rows } = await db.query(queryText, [projectId]);
    return rows;
  } catch (error) {
    console.error('Error getting project documents:', error);
    throw error;
  }
}

/**
 * Deletes a specific document record and its corresponding file.
 * @param {number} documentId The ID of the document.
 * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
 */
async function deleteProjectDocument(documentId) {
  try {
    const { rows } = await db.query('DELETE FROM project_documents WHERE document_id = $1 RETURNING document_path;', [documentId]);
    if (rows.length > 0 && rows[0].document_path) {
      const docPath = rows[0].document_path;
      // Construct absolute path carefully - similar to deleteProject
      const fullPath = path.join(__dirname, '..', 'uploads', docPath); // Adjust if path structure is different
      try {
        await fs.unlink(fullPath);
        console.log(`Deleted file: ${fullPath}`);
      } catch (fileError) {
        // If file deletion fails, the DB record is still gone. Log and potentially handle.
        console.error(`Error deleting file ${fullPath} for document ID ${documentId}:`, fileError.message);
      }
      return true;
    }
    return false; // Document not found or path was null
  } catch (error) {
    console.error('Error deleting project document:', error);
    throw error;
  }
}

module.exports = {
  createProject,
  getProjectsBySchoolId,
  getProjectById,
  updateProject,
  deleteProject,
  addProjectDocument,
  getProjectDocuments,
  deleteProjectDocument,
};
