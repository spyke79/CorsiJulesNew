const express = require('express');
const { body, param } = require('express-validator');
const schoolController = require('../controllers/schoolController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply admin protection to all routes in this file
router.use(protect, authorizeRoles('Amministratore'));

// Validation middleware for school data
const schoolValidationRules = [
  body('school_name', 'School name is required and must be a non-empty string').notEmpty().isString(),
  body('address', 'Address must be a string').optional().isString(),
  body('contact_person', 'Contact person must be a string').optional().isString(),
  body('contact_email', 'Contact email must be a valid email').optional().isEmail(),
  body('contact_phone', 'Contact phone must be a string').optional().isString(),
  body('plessi', 'Plessi must be an array').optional().isArray(),
  body('plessi.*.plesso_name', 'Plesso name is required if plesso object is provided').optional().if(body('plessi.*').isObject()).notEmpty().isString(),
  body('plessi.*.address', 'Plesso address must be a string').optional().if(body('plessi.*').isObject()).isString(),
  // Allow plessi to be an array of strings directly
  body('plessi.*', 'Plesso name as string must be non-empty if plesso is a string entry').optional().if(body('plessi.*').isString()).notEmpty().isString()
];

// Validation for schoolId URL parameter
const schoolIdParamValidation = [
  param('schoolId', 'School ID must be a valid integer').isInt()
];

// POST /api/schools - Create new school
router.post(
  '/',
  schoolValidationRules,
  schoolController.createSchoolHandler
);

// GET /api/schools - Get all schools (with filtering/searching via query params)
router.get(
  '/',
  schoolController.getAllSchoolsHandler
);

// GET /api/schools/:schoolId - Get school by ID
router.get(
  '/:schoolId',
  schoolIdParamValidation,
  schoolController.getSchoolByIdHandler
);

// PUT /api/schools/:schoolId - Update school
router.put(
  '/:schoolId',
  schoolIdParamValidation,
  schoolValidationRules, // Re-use the same rules as for creation
  schoolController.updateSchoolHandler
);

// DELETE /api/schools/:schoolId - Delete school
router.delete(
  '/:schoolId',
  schoolIdParamValidation,
  schoolController.deleteSchoolHandler
);

module.exports = router;
