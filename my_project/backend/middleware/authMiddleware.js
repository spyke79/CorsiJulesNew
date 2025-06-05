const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel'); // To fetch full user details if needed, or just rely on token

const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secret-and-complex-key';

/**
 * Middleware to protect routes by verifying JWT.
 * Attaches user information from token to req.user.
 */
async function protect(req, res, next) {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);

      // Attach decoded user payload to request object.
      // The payload should contain id, email, role_id, role_name as defined in authController.login
      req.user = decoded.user;

      next();
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed.' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token.' });
  }
}

/**
 * Middleware to authorize based on user role.
 * Example: Restrict access to 'Amministratore' role.
 * This middleware should run AFTER the 'protect' middleware.
 * @param {string[]} requiredRoles Array of role names that are allowed.
 */
function authorizeRoles(...requiredRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role_name) {
      return res.status(401).json({ message: 'Not authorized, user role not found on request.' });
    }

    if (!requiredRoles.includes(req.user.role_name)) {
      return res.status(403).json({
        message: `User role '${req.user.role_name}' is not authorized to access this route.`
      });
    }
    next();
  };
}


// Specific role middleware examples (can be simplified by using authorizeRoles)
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role_name === 'Amministratore') { // Ensure 'Amministratore' matches role_name in DB
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an administrator.' });
  }
};

const isExpert = (req, res, next) => {
  if (req.user && req.user.role_name === 'Esperto') { // Ensure 'Esperto' matches role_name in DB
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an expert.' });
  }
};


module.exports = {
  protect,
  authorizeRoles, // Generic role checker
  isAdmin,        // Specific admin checker
  isExpert,       // Specific expert checker
};
