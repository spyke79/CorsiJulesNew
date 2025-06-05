const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// @route   GET api/dashboard/todays-lessons
// @desc    Get all lessons scheduled for the current day
// @access  Private (Admin only)
router.get(
  '/todays-lessons',
  protect, // Ensures user is logged in
  authorizeRoles('Amministratore'), // Ensures user has the 'Amministratore' role
  dashboardController.getTodaysScheduledLessons
);

module.exports = router;
