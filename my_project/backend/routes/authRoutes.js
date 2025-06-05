const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
// const authMiddleware = require('../middleware/authMiddleware'); // Will be used later for protecting routes

const router = express.Router();

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password is required').exists(),
  ],
  authController.login
);

// @route   POST api/auth/users (or /register)
// @desc    Register a new user (e.g., an expert by an admin)
// @access  Public (for now, will be protected by admin role later)
router.post(
  '/users', // Changed from /register for consistency with RESTful naming for user resources
  [
    body('first_name', 'First name is required').not().isEmpty(),
    body('last_name', 'Last name is required').not().isEmpty(),
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    body('role_id', 'Role ID is required').isInt(),
    // Optional fields for experts - no specific validation here, but can be added
    body('cv_path').optional().isString(),
    body('availability').optional().isString(),
  ],
  // authMiddleware.protect, // Example: General protection
  // authMiddleware.isAdmin, // Example: Admin-only for this route
  authController.createUser
);

module.exports = router;
