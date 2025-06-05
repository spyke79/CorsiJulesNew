const express = require('express');
const { body, param } = require('express-validator');
const calendarLessonController = require('../controllers/calendarLessonController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply admin protection to all lesson routes
router.use(protect, authorizeRoles('Amministratore'));

// Validation rules for lesson data
const lessonValidationRules = [
  body('course_id', 'Course ID is required and must be an integer').isInt(),
  body('lesson_title', 'Lesson title is required').notEmpty().isString(),
  body('lesson_description', 'Description must be a string').optional().isString(),
  body('lesson_date', 'Lesson date is required and must be a valid date (YYYY-MM-DD)').isISO8601().toDate(), // Validates format, converts to Date object
  body('start_time', 'Start time is required (HH:MI or HH:MI:SS)').matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/),
  body('end_time', 'End time is required (HH:MI or HH:MI:SS) and must be after start_time').matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
    .custom((value, { req }) => {
      // Basic time comparison, does not handle overnight or multi-day yet.
      // Assumes start_time and end_time are on the same lesson_date.
      if (req.body.start_time && value <= req.body.start_time) {
        throw new Error('End time must be after start time.');
      }
      return true;
    }),
  body('plesso_id', 'Plesso ID must be an integer').optional({ checkFalsy: true }).isInt(),
  body('location_details', 'Location details must be a string').optional().isString(),
];

// Validation for courseId URL parameter (used for getting lessons by course)
const courseIdParamValidation = [
  param('courseId', 'Course ID must be a valid integer').isInt()
];

// Validation for lessonId URL parameter
const lessonIdParamValidation = [
  param('lessonId', 'Lesson ID must be a valid integer').isInt()
];

// POST /api/lessons - Create new lesson
router.post(
  '/',
  lessonValidationRules,
  calendarLessonController.createLessonHandler
);

// GET /api/courses/:courseId/lessons - Get all lessons for a course
router.get(
  '/courses/:courseId/lessons', // Nested under courses for clarity when fetching
  courseIdParamValidation,
  calendarLessonController.getLessonsByCourseIdHandler
);

// GET /api/lessons/:lessonId - Get lesson by ID
router.get(
  '/:lessonId',
  lessonIdParamValidation,
  calendarLessonController.getLessonByIdHandler
);

// PUT /api/lessons/:lessonId - Update lesson
router.put(
  '/:lessonId',
  lessonIdParamValidation,
  lessonValidationRules,
  calendarLessonController.updateLessonHandler
);

// DELETE /api/lessons/:lessonId - Delete lesson
router.delete(
  '/:lessonId',
  lessonIdParamValidation,
  calendarLessonController.deleteLessonHandler
);

module.exports = router;
