const express = require('express');
const { body, param, query } = require('express-validator');
const expertController = require('../controllers/expertController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// --- Expert CRUD Routes (Admin only) ---
const expertDataValidation = [
    body('first_name').notEmpty().isString().withMessage('First name is required.'),
    body('last_name').notEmpty().isString().withMessage('Last name is required.'),
    body('email').isEmail().withMessage('Valid email is required.'),
    body('password').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.'), // Optional for update
    body('is_enabled').isBoolean().withMessage('is_enabled flag (boolean) is required.'),
    // Expert specific fields
    body('cv_path').optional({ checkFalsy: true }).isString(),
    body('availability').optional({ checkFalsy: true }).isString(),
    body('codice_fiscale').optional({ checkFalsy: true }).isString().isLength({ min: 16, max: 16 }).withMessage('Codice Fiscale must be 16 characters.'),
    body('address').optional({ checkFalsy: true }).isString(),
    body('pec').optional({ checkFalsy: true }).isEmail().withMessage('PEC must be a valid email.'),
    body('fiscal_regime').optional({ checkFalsy: true }).isString(),
    body('subject_ids').optional().isArray().withMessage('subject_ids must be an array of numbers.'),
    body('subject_ids.*').optional().isInt().withMessage('Each subject_id must be an integer.')
];

const expertIdParamValidation = [
    param('expertId', 'Expert ID must be an integer').isInt()
];

router.post(
    '/',
    protect, authorizeRoles('Amministratore'),
    [...expertDataValidation, body('password').notEmpty().isLength({min: 6}).withMessage('Password is required for new expert and must be at least 6 characters long.')], // Password required for create
    expertController.createExpertHandler
);

router.get(
    '/',
    protect, authorizeRoles('Amministratore'),
    [ // Optional query validation for filtering
        query('nameSearch').optional().isString(),
        query('subjectId').optional().isInt()
    ],
    expertController.getAllExpertsHandler
);

// This route remains for general dropdown population
router.get(
  '/list',
  protect, authorizeRoles('Amministratore'),
  expertController.getExpertsListHandler
);

router.get(
    '/:expertId',
    protect, authorizeRoles('Amministratore'),
    expertIdParamValidation,
    expertController.getExpertByIdHandler
);

router.put(
    '/:expertId',
    protect, authorizeRoles('Amministratore'),
    expertIdParamValidation,
    expertDataValidation, // Password is optional here (handled in controller if provided)
    expertController.updateExpertHandler
);

router.delete(
    '/:expertId',
    protect, authorizeRoles('Amministratore'),
    expertIdParamValidation,
    expertController.deleteExpertHandler
);

router.get(
    '/:expertId/calendar',
    protect, authorizeRoles('Amministratore', 'Esperto'), // Allow expert to see their own calendar
    expertIdParamValidation,
    // TODO: Add check if non-admin user is requesting their own calendar
    (req, res, next) => { // Custom middleware to check ownership for 'Esperto' role
        if (req.user.role_name === 'Esperto' && req.user.id !== parseInt(req.params.expertId, 10)) {
             // This check assumes req.user.id is the user_id.
             // We need to map expertId (experts.expert_id) to user_id for this check or adjust req.user structure.
             // For now, let's assume an admin is more likely to use this, or direct comparison works if user.id on token IS expert_id.
             // This needs further refinement based on how JWT payload `id` is set for experts.
             // If JWT `id` is user_id, we'd need to fetch expert's user_id or compare with a list of user_ids they manage.
             // For simplicity, if it's an expert, they can only see their own. This requires expert_id to be the same as user.id in token.
             // This is not the case with current schema (expert_id is serial, user_id is FK).
             // So, this check is flawed for now. A proper check would involve:
             // 1. Get expert record by req.params.expertId
             // 2. Compare expert.user_id with req.user.id
             // For now, only admin access is simpler to enforce correctly.
             // Reverting to Admin only for this endpoint to avoid flawed expert self-access logic here.
            // return res.status(403).json({ message: 'Experts can only view their own calendar.' });
        }
        next();
    },
    authorizeRoles('Amministratore'), // Simplified to admin only for now
    expertController.getExpertOverallCalendarHandler
);


// --- Subject Management Routes (Admin only) ---
router.get(
    '/subjects/all', // Changed from /api/subjects to /api/experts/subjects/all to be within expertRoutes
    protect, authorizeRoles('Amministratore'),
    expertController.getSubjectsHandler
);

router.post(
    '/subjects', // Changed from /api/subjects
    protect, authorizeRoles('Amministratore'),
    [
        body('subject_name', 'Subject name is required.').notEmpty().isString(),
        body('description').optional().isString()
    ],
    expertController.addSubjectHandler
);

// Route for an expert to get their own assigned courses
router.get(
    '/my-courses', // Or a path like '/me/courses'
    protect, authorizeRoles('Esperto'),
    expertController.getCoursesForLoggedInExpertHandler
);

// Route for an expert to get their calendar for a specific course
router.get(
    '/my-courses/:courseId/calendar',
    protect, authorizeRoles('Esperto'),
    [param('courseId', 'Course ID must be an integer').isInt()], // Validate courseId param
    expertController.getCourseCalendarForLoggedInExpertHandler
);


module.exports = router;
