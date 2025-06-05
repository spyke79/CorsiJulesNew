const projectModel = require('../models/projectModel');
const { validationResult } = require('express-validator');
const fs = require('fs').promises; // For file system operations
const path = require('path'); // To construct file paths

// --- Project Handlers ---

async function createProjectHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const newProject = await projectModel.createProject(req.body);
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Create project error in controller:', error.message);
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    if (error.message.includes('School not found')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error creating project.' });
  }
}

async function getProjectsBySchoolIdHandler(req, res) {
  const { schoolId } = req.params;
  try {
    const projects = await projectModel.getProjectsBySchoolId(parseInt(schoolId, 10));
    res.json(projects);
  } catch (error) {
    console.error('Get projects by school ID error:', error.message);
    res.status(500).json({ message: 'Server error retrieving projects.' });
  }
}

async function getProjectByIdHandler(req, res) {
  const { projectId } = req.params;
  try {
    const project = await projectModel.getProjectById(parseInt(projectId, 10));
    if (!project) {
      return res.status(404).json({ message: 'Project not found.' });
    }
    res.json(project);
  } catch (error) {
    console.error('Get project by ID error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving project.' });
  }
}

async function updateProjectHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { projectId } = req.params;
  try {
    const updatedProject = await projectModel.updateProject(parseInt(projectId, 10), req.body);
    if (!updatedProject) {
      return res.status(404).json({ message: 'Project not found for update.' });
    }
    res.json(updatedProject);
  } catch (error) {
    console.error('Update project error in controller:', error.message);
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
     if (error.message.includes('School not found')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error updating project.' });
  }
}

async function deleteProjectHandler(req, res) {
  const { projectId } = req.params;
  try {
    const success = await projectModel.deleteProject(parseInt(projectId, 10));
    if (!success) {
      return res.status(404).json({ message: 'Project not found or already deleted.' });
    }
    res.status(200).json({ message: 'Project and associated documents/files deleted successfully.' });
  } catch (error) {
    console.error('Delete project error in controller:', error.message);
    res.status(500).json({ message: 'Server error deleting project.' });
  }
}

// --- Project Document Handlers ---

async function uploadProjectDocumentHandler(req, res) {
  // File is already handled by multer middleware if this point is reached without error
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or file type rejected.' });
  }

  const { projectId } = req.params;
  const document_name = req.body.document_name || req.file.originalname; // Use provided name or original filename

  // The path stored in DB should be relative to a known base 'uploads' dir
  // e.g., project_docs/project_123/timestamp-filename.pdf
  // req.file.path from multer is an absolute path. We need to make it relative.
  const uploadsBaseDir = path.join(__dirname, '..', 'uploads');
  const relativePath = path.relative(uploadsBaseDir, req.file.path);


  const documentData = {
    document_name,
    document_path: relativePath.replace(/\\/g, '/'), // Ensure forward slashes for consistency
  };

  try {
    const newDocument = await projectModel.addProjectDocument(parseInt(projectId, 10), documentData);
    res.status(201).json({ message: 'Document uploaded successfully.', document: newDocument });
  } catch (error) {
    console.error('Upload project document error in controller:', error.message);
    // If DB entry fails, attempt to delete the uploaded file
    try {
      await fs.unlink(req.file.path);
      console.log('Cleaned up uploaded file after DB error:', req.file.path);
    } catch (unlinkError) {
      console.error('Error cleaning up file after DB error:', unlinkError.message);
    }
    if (error.message.includes('Project not found')) {
        return res.status(404).json({message: error.message});
    }
    res.status(500).json({ message: 'Server error uploading document.' });
  }
}

async function getProjectDocumentsHandler(req, res) {
  const { projectId } = req.params;
  try {
    const documents = await projectModel.getProjectDocuments(parseInt(projectId, 10));
    // Could also check if project itself exists first if desired
    res.json(documents);
  } catch (error) {
    console.error('Get project documents error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving project documents.' });
  }
}

async function deleteProjectDocumentHandler(req, res) {
  const { documentId } = req.params;
  try {
    // The model's deleteProjectDocument function handles deleting the file from server
    const success = await projectModel.deleteProjectDocument(parseInt(documentId, 10));
    if (!success) {
      return res.status(404).json({ message: 'Document not found or already deleted.' });
    }
    res.status(200).json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Delete project document error in controller:', error.message);
    res.status(500).json({ message: 'Server error deleting project document.' });
  }
}

module.exports = {
  createProjectHandler,
  getProjectsBySchoolIdHandler,
  getProjectByIdHandler,
  updateProjectHandler,
  deleteProjectHandler,
  uploadProjectDocumentHandler,
  getProjectDocumentsHandler,
  deleteProjectDocumentHandler,
};
