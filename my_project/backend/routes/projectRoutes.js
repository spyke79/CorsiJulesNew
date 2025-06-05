const express = require('express');
const { body, param } = require('express-validator');
const projectController = require('../controllers/projectController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { uploadProjectDocument } = require('../middleware/uploadMiddleware'); // Multer middleware

const router = express.Router();

// Apply admin protection to all project and document routes
router.use(protect, authorizeRoles('Amministratore'));

// --- Project Routes ---

// Validation for project data
const projectValidationRules = [
  body('school_id', 'School ID is required and must be an integer').isInt(),
  body('project_name', 'Project name is required').notEmpty().isString(),
  body('project_code', 'Project code is required and must be unique').optional().notEmpty().isString(), // Assuming optional but unique if provided
  body('description', 'Description must be a string').optional().isString(),
  body('start_date', 'Start date must be a valid date').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('end_date', 'End date must be a valid date and after start_date').optional({ checkFalsy: true }).isISO8601().toDate()
    .custom((value, { req }) => {
      if (req.body.start_date && value < req.body.start_date) {
        throw new Error('End date must be after start date.');
      }
      return true;
    }),
  body('status', 'Status must be a string').optional().isString(),
];

// Validation for projectId URL parameter
const projectIdParamValidation = [
  param('projectId', 'Project ID must be a valid integer').isInt()
];
// Validation for schoolId URL parameter
const schoolIdParamValidation = [
  param('schoolId', 'School ID must be a valid integer').isInt()
];
// Validation for documentId URL parameter
const documentIdParamValidation = [
  param('documentId', 'Document ID must be a valid integer').isInt()
];


// POST /api/projects - Create new project
router.post(
  '/',
  projectValidationRules,
  projectController.createProjectHandler
);

// GET /api/schools/:schoolId/projects - Get all projects for a specific school
router.get(
  '/schools/:schoolId/projects', // Nested under schools conceptually for fetching
  schoolIdParamValidation,
  projectController.getProjectsBySchoolIdHandler
);

// GET /api/projects/:projectId - Get project by ID
router.get(
  '/:projectId',
  projectIdParamValidation,
  projectController.getProjectByIdHandler
);

// PUT /api/projects/:projectId - Update project
router.put(
  '/:projectId',
  projectIdParamValidation,
  projectValidationRules, // Re-use create rules; ensure all fields are optional or handle partial updates in controller/model
  projectController.updateProjectHandler
);

// DELETE /api/projects/:projectId - Delete project
router.delete(
  '/:projectId',
  projectIdParamValidation,
  projectController.deleteProjectHandler
);

// --- Project Document Routes ---

// POST /api/projects/:projectId/documents - Upload document for a project
router.post(
  '/:projectId/documents',
  projectIdParamValidation,
  uploadProjectDocument, // Multer middleware for single file upload expecting field 'document'
  // Optional: validation for req.body.document_name if you want to enforce it
  body('document_name').optional().isString().withMessage('Document name must be a string if provided.'),
  projectController.uploadProjectDocumentHandler
);

// GET /api/projects/:projectId/documents - Get all documents for a project
router.get(
  '/:projectId/documents',
  projectIdParamValidation,
  projectController.getProjectDocumentsHandler
);

// DELETE /api/projects/documents/:documentId - Delete a specific document
// Note: This route is not nested under /:projectId to allow direct deletion by documentId
// If documentId is not globally unique (it is, as it's a SERIAL PRIMARY KEY),
// then projectId might be needed in the path or as a check.
router.delete(
  '/documents/:documentId',
  documentIdParamValidation,
  projectController.deleteProjectDocumentHandler
);

module.exports = router;
