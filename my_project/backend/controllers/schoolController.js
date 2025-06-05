const schoolModel = require('../models/schoolModel');
const { validationResult } = require('express-validator');

/**
 * Handles creation of a new school.
 */
async function createSchoolHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { school_name, address, contact_person, contact_email, contact_phone, plessi } = req.body;
  const schoolData = { school_name, address, contact_person, contact_email, contact_phone };

  try {
    const newSchool = await schoolModel.createSchool(schoolData, plessi);
    res.status(201).json(newSchool);
  } catch (error) {
    console.error('Create school error in controller:', error.message);
    if (error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message }); // Conflict
    }
    res.status(500).json({ message: 'Server error creating school.' });
  }
}

/**
 * Handles retrieval of all schools, with optional query parameters for filtering.
 */
async function getAllSchoolsHandler(req, res) {
  const { nameSearch } = req.query; // Example: /api/schools?nameSearch=Test
  const filters = {};

  if (nameSearch) {
    filters.nameSearch = nameSearch;
  }

  try {
    const schools = await schoolModel.getAllSchools(filters);
    res.json(schools);
  } catch (error) {
    console.error('Get all schools error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving schools.' });
  }
}

/**
 * Handles retrieval of a single school by its ID.
 */
async function getSchoolByIdHandler(req, res) {
  const { schoolId } = req.params;
  try {
    const school = await schoolModel.getSchoolById(parseInt(schoolId, 10));
    if (!school) {
      return res.status(404).json({ message: 'School not found.' });
    }
    res.json(school);
  } catch (error) {
    console.error('Get school by ID error in controller:', error.message);
    res.status(500).json({ message: 'Server error retrieving school.' });
  }
}

/**
 * Handles updating an existing school.
 */
async function updateSchoolHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { schoolId } = req.params;
  const { school_name, address, contact_person, contact_email, contact_phone, plessi } = req.body;
  const schoolData = { school_name, address, contact_person, contact_email, contact_phone };

  try {
    const updatedSchool = await schoolModel.updateSchool(parseInt(schoolId, 10), schoolData, plessi);
    if (!updatedSchool) {
      return res.status(404).json({ message: 'School not found for update.' });
    }
    res.json(updatedSchool);
  } catch (error) {
    console.error('Update school error in controller:', error.message);
     if (error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message }); // Conflict
    }
    res.status(500).json({ message: 'Server error updating school.' });
  }
}

/**
 * Handles deletion of a school.
 */
async function deleteSchoolHandler(req, res) {
  const { schoolId } = req.params;
  try {
    const success = await schoolModel.deleteSchool(parseInt(schoolId, 10));
    if (!success) {
      // This might happen if the school_id doesn't exist, rowCount will be 0.
      return res.status(404).json({ message: 'School not found or already deleted.' });
    }
    res.status(200).json({ message: 'School deleted successfully.' }); // 204 No Content could also be used
  } catch (error) {
    console.error('Delete school error in controller:', error.message);
    // Check for specific DB errors, e.g., foreign key violation if ON DELETE RESTRICT was used elsewhere
    res.status(500).json({ message: 'Server error deleting school.' });
  }
}

module.exports = {
  createSchoolHandler,
  getAllSchoolsHandler,
  getSchoolByIdHandler,
  updateSchoolHandler,
  deleteSchoolHandler,
};
