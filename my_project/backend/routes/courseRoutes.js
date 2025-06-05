const express = require('express');
const { body, param } = require('express-validator');
const courseController = require('../controllers/courseController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply admin protection to all course routes
router.use(protect, authorizeRoles('Amministratore'));

// Validation rules for course data
const courseValidationRules = [
  body('project_id', 'Project ID is required and must be an integer').isInt(),
  body('course_name', 'Course name is required').notEmpty().isString(),
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
  body('experts', 'Experts must be an array').optional().isArray(),
  body('experts.*.expert_id', 'Each expert must have an expert_id (integer)').if(body('experts').exists()).notEmpty().isInt(),
  body('experts.*.hourly_cost', 'Each expert must have an hourly_cost (number)').if(body('experts').exists()).notEmpty().isNumeric(),
  body('tutors', 'Tutors must be an array').optional().isArray(),
  body('tutors.*.tutor_name', 'Each tutor must have a tutor_name (string)').if(body('tutors').exists()).notEmpty().isString(),
  body('tutors.*.tutor_email', 'Tutor email must be a valid email').optional({ checkFalsy: true }).isEmail(),
];

// Validation for projectId URL parameter (used for getting courses by project)
const projectIdParamValidation = [
  param('projectId', 'Project ID must be a valid integer').isInt()
];

// Validation for courseId URL parameter
const courseIdParamValidation = [
  param('courseId', 'Course ID must be a valid integer').isInt()
];


// POST /api/courses - Create new course
router.post(
  '/',
  courseValidationRules,
  courseController.createCourseHandler
);

// GET /api/projects/:projectId/courses - Get all courses for a project
router.get(
  '/projects/:projectId/courses', // Route is nested under projects for clarity
  projectIdParamValidation,
  courseController.getCoursesByProjectIdHandler
);

// GET /api/courses/:courseId - Get course by ID
router.get(
  '/:courseId',
  courseIdParamValidation,
  courseController.getCourseByIdHandler
);

// PUT /api/courses/:courseId - Update course
router.put(
  '/:courseId',
  courseIdParamValidation,
  courseValidationRules,
  courseController.updateCourseHandler
);

// DELETE /api/courses/:courseId - Delete course
router.delete(
  '/:courseId',
  courseIdParamValidation,
  courseController.deleteCourseHandler
);

module.exports = router;
