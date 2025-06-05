const calendarLessonModel = require('../models/calendarLessonModel');
const courseModel = require('../models/courseModel'); // To get total course duration
const { validationResult } = require('express-validator');

async function createLessonHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // lessonData should include course_id, lesson_title, lesson_description,
    // lesson_date (YYYY-MM-DD), start_time (HH:MI), end_time (HH:MI),
    // plesso_id (optional), location_details (optional)
    const lessonData = req.body;
    const result = await calendarLessonModel.createLesson(lessonData);

    if (result.error && result.error === 'conflict') {
      return res.status(409).json({
        message: result.message,
        conflicts: result.conflicts
      });
    }
    res.status(201).json(result);
  } catch (error) {
    console.error('Create lesson error in controller:', error.message);
    if (error.message.includes('not found')) { // Course or Plesso not found
        return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('Invalid date or time format')) {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error creating lesson.' });
  }
}

async function getLessonsByCourseIdHandler(req, res) {
  const { courseId } = req.params;
  try {
    const lessons = await calendarLessonModel.getLessonsByCourseId(parseInt(courseId, 10));

    // Get total course duration (assuming courses table has a 'total_hours' field or similar)
    // For this example, let's assume courses table does NOT have total_hours.
    // This information might come from project requirements or be an aggregate of planned activities.
    // If we need to fetch it from the `courses` table (e.g., a manually set field `planned_total_hours`):
    // const courseDetails = await db.query('SELECT planned_total_hours FROM courses WHERE course_id = $1', [courseId]);
    // const totalCourseHours = courseDetails.rows.length > 0 ? courseDetails.rows[0].planned_total_hours : 0;
    // For now, we'll just calculate scheduled hours. A 'total planned hours' field on 'courses' would be needed for 'remaining'.

    const scheduledHours = await calendarLessonModel.getCourseScheduledHours(parseInt(courseId, 10));

    // To provide remaining hours, a 'total_planned_hours' field on the 'courses' table would be ideal.
    // The frontend would typically fetch course details (including this field) separately.
    // For this endpoint, we primarily provide the lessons and the sum of their scheduled hours.

    res.json({
      lessons,
      total_scheduled_hours: scheduledHours,
      // UI can calculate remaining_hours if it has total_planned_hours for the course.
    });

  } catch (error) {
    console.error('Get lessons by course ID error:', error.message);
    res.status(500).json({ message: 'Server error retrieving lessons.' });
  }
}

async function getLessonByIdHandler(req, res) {
  const { lessonId } = req.params;
  try {
    const lesson = await calendarLessonModel.getLessonById(parseInt(lessonId, 10));
    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found.' });
    }
    res.json(lesson);
  } catch (error) {
    console.error('Get lesson by ID error:', error.message);
    res.status(500).json({ message: 'Server error retrieving lesson.' });
  }
}

async function updateLessonHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { lessonId } = req.params;
  const lessonData = req.body;

  try {
    const result = await calendarLessonModel.updateLesson(parseInt(lessonId, 10), lessonData);

    if (!result) {
        return res.status(404).json({ message: 'Lesson not found for update.' });
    }
    if (result.error && result.error === 'conflict') {
      return res.status(409).json({
        message: result.message,
        conflicts: result.conflicts
      });
    }
    res.json(result);
  } catch (error) {
    console.error('Update lesson error in controller:', error.message);
    if (error.message.includes('not found')) { // Course or Plesso not found
        return res.status(404).json({ message: error.message });
    }
    if (error.message.includes('Invalid date or time format')) {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error updating lesson.' });
  }
}

async function deleteLessonHandler(req, res) {
  const { lessonId } = req.params;
  try {
    const success = await calendarLessonModel.deleteLesson(parseInt(lessonId, 10));
    if (!success) {
      return res.status(404).json({ message: 'Lesson not found or already deleted.' });
    }
    res.status(200).json({ message: 'Lesson deleted successfully.' });
  } catch (error) {
    console.error('Delete lesson error in controller:', error.message);
    res.status(500).json({ message: 'Server error deleting lesson.' });
  }
}

module.exports = {
  createLessonHandler,
  getLessonsByCourseIdHandler,
  getLessonByIdHandler,
  updateLessonHandler,
  deleteLessonHandler,
};
