const bcrypt = require('bcryptjs');

const saltRounds = 10; // Or make it configurable via environment variable

/**
 * Hashes a plain text password.
 * @param {string} plainPassword The password to hash.
 * @returns {Promise<string>} The hashed password.
 */
async function hashPassword(plainPassword) {
  try {
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Error hashing password'); // Or handle more gracefully
  }
}

/**
 * Compares a plain text password with a hashed password.
 * @param {string} plainPassword The plain text password.
 * @param {string} hashedPassword The hashed password from the database.
 * @returns {Promise<boolean>} True if passwords match, false otherwise.
 */
async function comparePasswords(plainPassword, hashedPassword) {
  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (error)
    console.error('Error comparing passwords:', error);
    // In case of an error (e.g., invalid hash format), treat as no match for security.
    return false;
  }
}

module.exports = {
  hashPassword,
  comparePasswords,
};
