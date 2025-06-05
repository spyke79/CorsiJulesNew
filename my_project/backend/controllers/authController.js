const userModel = require('../models/userModel');
const passwordUtils = require('../utils/passwordUtils');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Consider moving JWT secret and expiration to environment variables for security
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secret-and-complex-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // Token expiration time

/**
 * Handles user login.
 * Validates input, checks credentials, and issues a JWT if successful.
 */
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await userModel.findUserByEmail(email);

    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Invalid credentials or user not active.' });
    }

    const isMatch = await passwordUtils.comparePasswords(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // User authenticated, generate JWT
    const payload = {
      user: {
        id: user.user_id,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name, // Included from findUserByEmail
      },
    };

    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
      (err, token) => {
        if (err) throw err;
        // Return token and user info (excluding password hash)
        const userToReturn = { ...user };
        delete userToReturn.password_hash;
        res.json({ token, user: userToReturn });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
}

/**
 * Handles creation of a new user (e.g., admin creating an expert).
 * Validates input, hashes password, and saves user to database.
 */
async function createUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { first_name, last_name, email, password, role_id, cv_path, availability } = req.body;

  try {
    // Check if user already exists
    let existingUser = await userModel.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const hashedPassword = await passwordUtils.hashPassword(password);

    const userData = {
      first_name,
      last_name,
      email,
      password_hash: hashedPassword,
      role_id, // Ensure this role_id is valid and corresponds to 'Amministratore' or 'Esperto' etc.
    };

    let expertDetails = null;
    // If cv_path or availability are provided, pass them as expertDetails.
    // The userModel's createUser function will handle creating an expert record if appropriate.
    if (cv_path !== undefined || availability !== undefined) {
      expertDetails = { cv_path, availability };
    }

    const newUser = await userModel.createUser(userData, expertDetails);

    // The password_hash is already removed by the model, but ensure it here too if necessary.
    // delete newUser.password_hash;

    res.status(201).json({ message: 'User created successfully.', user: newUser });

  } catch (error) {
    console.error('User creation error:', error);
    if (error.message === 'Email already exists.') {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error during user creation.' });
  }
}

module.exports = {
  login,
  createUser,
};
