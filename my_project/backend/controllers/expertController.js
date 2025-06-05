const expertModel = require('../models/expertModel');
const userModel = require('../models/userModel'); // For password updates
const { hashPassword } = require('../utils/passwordUtils');
const { validationResult } = require('express-validator');
const calendarLessonModel = require('../models/calendarLessonModel'); // Added import

async function createExpertHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    first_name, last_name, email, password, // User data (is_active linked to is_enabled)
    cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled, // Expert data
    subject_ids // Array of subject IDs
  } = req.body;

  const userData = { first_name, last_name, email, password, is_active: is_enabled };
  const expertSpecificData = { cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled };

  try {
    const newExpert = await expertModel.createExpert(userData, expertSpecificData, subject_ids);
    res.status(201).json(newExpert);
  } catch (error) {
    console.error('Create expert error in controller:', error.message);
    if (error.message.includes('already exists') || error.message.includes('Role \'Esperto\' not found')) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error creating expert.' });
  }
}

async function getAllExpertsHandler(req, res) {
  const { nameSearch, subjectId } = req.query;
  const filters = {};
  if (nameSearch) filters.nameSearch = nameSearch;
  if (subjectId) filters.subjectId = parseInt(subjectId, 10);

  try {
    const experts = await expertModel.getAllExperts(filters);
    res.json(experts);
  } catch (error) {
    console.error('Get all experts error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving experts.' });
  }
}

async function getExpertByIdHandler(req, res) {
  const { expertId } = req.params;
  try {
    const expert = await expertModel.getExpertById(parseInt(expertId, 10));
    if (!expert) {
      return res.status(404).json({ message: 'Expert not found.' });
    }
    res.json(expert);
  } catch (error) {
    console.error('Get expert by ID error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving expert.' });
  }
}

async function updateExpertHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { expertId } = req.params;
  const {
    first_name, last_name, email, password, // User data (password is optional)
    cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled, // Expert data
    subject_ids // Array of subject IDs
  } = req.body;

  const userData = { first_name, last_name, email, is_active: is_enabled };
  const expertSpecificData = { cv_path, availability, codice_fiscale, address, pec, fiscal_regime, is_enabled };

  try {
    if (password) {
      const expertDetails = await expertModel.getExpertById(parseInt(expertId, 10));
      if (!expertDetails || !expertDetails.user_id) {
        return res.status(404).json({ message: 'Expert not found or user_id missing for password update.' });
      }
      const hashedPassword = await hashPassword(password);
      await userModel.updateUserPassword(expertDetails.user_id, hashedPassword);
    }

    const updatedExpert = await expertModel.updateExpert(parseInt(expertId, 10), userData, expertSpecificData, subject_ids);
    if (!updatedExpert) {
      return res.status(404).json({ message: 'Expert not found for update.' });
    }
    res.json(updatedExpert);
  } catch (error) {
    console.error('Update expert error in controller:', error.message);
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    if (error.message.includes('Expert not found')) {
        return res.status(404).json({message: error.message});
    }
    res.status(500).json({ message: 'Server error updating expert.' });
  }
}

async function deleteExpertHandler(req, res) {
  const { expertId } = req.params;
  try {
    const success = await expertModel.deleteExpert(parseInt(expertId, 10));
    if (!success) {
      return res.status(404).json({ message: 'Expert not found or already deleted.' });
    }
    res.status(200).json({ message: 'Expert deleted successfully.' });
  } catch (error) {
    console.error('Delete expert error in controller:', error.message);
    if (error.message.includes('still assigned to courses')) {
        return res.status(400).json({message: error.message});
    }
    res.status(500).json({ message: 'Server error deleting expert.' });
  }
}

async function getExpertOverallCalendarHandler(req, res) {
  const { expertId } = req.params;
  const { startDate, endDate } = req.query;
  const dateRange = { startDate, endDate };

  try {
    const calendarEvents = await expertModel.getExpertOverallCalendar(parseInt(expertId, 10), dateRange);
    res.json(calendarEvents);
  } catch (error) {
    console.error('Get expert calendar error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving expert calendar.' });
  }
}

async function getSubjectsHandler(req, res) {
  try {
    const subjects = await expertModel.getSubjects();
    res.json(subjects);
  } catch (error) {
    console.error('Get subjects error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving subjects.' });
  }
}

async function addSubjectHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { subject_name, description } = req.body;
  try {
    const result = await expertModel.addSubject(subject_name, description);
    if (result.status === 'existing') {
      return res.status(200).json({ message: 'Subject already exists.', subject: result });
    }
    res.status(201).json({ message: 'Subject added successfully.', subject: result });
  } catch (error) {
    console.error('Add subject error in controller:', error.message);
    if (error.message.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error adding subject.' });
  }
}

async function getExpertsListForSelectionHandler(req, res) {
    try {
        const expertsList = await expertModel.getExpertsList();
        res.json(expertsList);
    } catch (error) {
        console.error('Get experts list for selection error in expertController:', error.message);
        res.status(500).json({ message: 'Server error retrieving experts list for selection.' });
    }
}

async function getCoursesForLoggedInExpertHandler(req, res) {
  try {
    const userId = req.user.id; // This is users.user_id from JWT payload
    const expertDetails = await expertModel.getExpertDetailsByUserId(userId);

    if (!expertDetails || !expertDetails.expert_id) {
      return res.status(403).json({ message: 'User is not an expert or expert record not found.' });
    }
    const expertId = expertDetails.expert_id;

    const courses = await expertModel.getCoursesForExpert(expertId);
    res.json(courses);
  } catch (error) {
    console.error('Get courses for logged-in expert error:', error.message);
    res.status(500).json({ message: 'Server error retrieving courses for expert.' });
  }
}

async function getCourseCalendarForLoggedInExpertHandler(req, res) {
  const errors = validationResult(req); // For any route-level validation, if added
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = req.user.id; // users.user_id from JWT
    const { courseId } = req.params;

    const expertDetails = await expertModel.getExpertDetailsByUserId(userId);
    if (!expertDetails || !expertDetails.expert_id) {
      return res.status(403).json({ message: 'User is not recognized as an expert.' });
    }
    const expertId = expertDetails.expert_id; // This is experts.expert_id

    const lessonsResult = await calendarLessonModel.getLessonsForCourseByExpert(parseInt(courseId, 10), expertId);

    if (lessonsResult.error && lessonsResult.error === 'not_assigned') {
      return res.status(403).json({ message: lessonsResult.message });
    }

    res.json(lessonsResult); // This will be an array of lessons or an error object from the model

  } catch (error) {
    console.error('Get course calendar for logged-in expert error:', error.message);
    res.status(500).json({ message: 'Server error retrieving course calendar for expert.' });
  }
}

module.exports = {
  createExpertHandler,
  getAllExpertsHandler,
  getExpertByIdHandler,
  updateExpertHandler,
  deleteExpertHandler,
  getExpertOverallCalendarHandler,
  getSubjectsHandler,
  addSubjectHandler,
  getExpertsListHandler: getExpertsListForSelectionHandler,
  getCoursesForLoggedInExpertHandler,
  getCourseCalendarForLoggedInExpertHandler,
};
