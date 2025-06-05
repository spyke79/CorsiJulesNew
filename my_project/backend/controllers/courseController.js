const courseModel = require('../models/courseModel');
const { validationResult } = require('express-validator');

async function createCourseHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { project_id, course_name, description, start_date, end_date, status, experts, tutors } = req.body;
  const courseData = { project_id, course_name, description, start_date, end_date, status };

  try {
    const newCourse = await courseModel.createCourse(courseData, experts, tutors);
    res.status(201).json(newCourse);
  } catch (error) {
    console.error('Create course error in controller:', error.message);
    if (error.message.includes('not found')) { // Project or Expert not found
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error creating course.' });
  }
}

async function getCoursesByProjectIdHandler(req, res) {
  const { projectId } = req.params;
  try {
    // Validate projectId if not already done by route middleware (it will be)
    const courses = await courseModel.getCoursesByProjectId(parseInt(projectId, 10));
    res.json(courses);
  } catch (error) {
    console.error('Get courses by project ID error:', error.message);
    res.status(500).json({ message: 'Server error retrieving courses.' });
  }
}

async function getCourseByIdHandler(req, res) {
  const { courseId } = req.params;
  try {
    const course = await courseModel.getCourseById(parseInt(courseId, 10));
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }
    res.json(course);
  } catch (error) {
    console.error('Get course by ID error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving course.' });
  }
}

async function updateCourseHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { courseId } = req.params;
  const { project_id, course_name, description, start_date, end_date, status, experts, tutors } = req.body;
  const courseData = { project_id, course_name, description, start_date, end_date, status };

  try {
    const updatedCourse = await courseModel.updateCourse(parseInt(courseId, 10), courseData, experts, tutors);
    if (!updatedCourse) {
      return res.status(404).json({ message: 'Course not found for update.' });
    }
    res.json(updatedCourse);
  } catch (error) {
    console.error('Update course error in controller:', error.message);
    if (error.message.includes('not found')) { // Project or Expert not found
        return res.status(404).json({ message: error.message });
    }
     if (error.message.includes('required')) { // Validation error from model (e.g. expert_id or hourly_cost missing)
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error updating course.' });
  }
}

async function deleteCourseHandler(req, res) {
  const { courseId } = req.params;
  try {
    const success = await courseModel.deleteCourse(parseInt(courseId, 10));
    if (!success) {
      return res.status(404).json({ message: 'Course not found or already deleted.' });
    }
    res.status(200).json({ message: 'Course deleted successfully.' });
  } catch (error) {
    console.error('Delete course error in controller:', error.message);
    res.status(500).json({ message: 'Server error deleting course.' });
  }
}

module.exports = {
  createCourseHandler,
  getCoursesByProjectIdHandler,
  getCourseByIdHandler,
  updateCourseHandler,
  deleteCourseHandler,
};
