const calendarLessonModel = require('../models/calendarLessonModel');
// const courseModel = require('../models/courseModel'); // Not directly used here for total_planned_hours anymore
const { validationResult } = require('express-validator');
const pdfService = require('../services/pdfService'); // Import PDF service

async function createLessonHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
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
    if (error.message.includes('not found')) {
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
    const scheduledHours = await calendarLessonModel.getCourseScheduledHours(parseInt(courseId, 10));

    res.json({
      lessons,
      total_scheduled_hours: scheduledHours,
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
    console.error('Get lesson by ID error in controller:', error.message);
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
    if (error.message.includes('not found')) {
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

async function exportCourseCalendarPdfHandler(req, res) {
  const { courseId } = req.params;
  try {
    const pdfBuffer = await pdfService.generateCourseCalendarPdf(parseInt(courseId, 10));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="calendario_corso_${courseId}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error(`Error exporting PDF for course ${courseId}:`, error.message);
    if (error.message.includes('Course not found')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error generating PDF calendar.' });
  }
}

module.exports = {
  createLessonHandler,
  getLessonsByCourseIdHandler,
  getLessonByIdHandler,
  updateLessonHandler,
  deleteLessonHandler,
  exportCourseCalendarPdfHandler, // Added new handler
};
