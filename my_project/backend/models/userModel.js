const db = require('../config/db'); // Assuming db.js exports a query function or a pool

/**
 * Finds a user by their email address.
 * @param {string} email The email address to search for.
 * @returns {Promise<object|null>} The user object if found, otherwise null.
 */
async function findUserByEmail(email) {
  const queryText = `
    SELECT u.*, r.role_name
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    WHERE u.email = $1;
  `;
  try {
    const { rows } = await db.query(queryText, [email]);
    return rows[0] || null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    throw error; // Rethrow to be handled by the controller
  }
}

/**
 * Creates a new user in the database.
 * If expertDetails are provided, it also creates an entry in the experts table within the same transaction.
 * @param {object} userData Contains first_name, last_name, email, password_hash, role_id.
 * @param {object|null} expertDetails Contains cv_path, availability if the user is an expert.
 * @returns {Promise<object>} The newly created user object (excluding password).
 */
async function createUser(userData, expertDetails = null) {
  const { first_name, last_name, email, password_hash, role_id } = userData;
  let client; // For transaction

  try {
    client = await db.connect(); // Get a client from the pool for transaction
    await client.query('BEGIN'); // Start transaction

    // Insert into users table
    const userInsertQuery = `
      INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING user_id, first_name, last_name, email, role_id, is_active, created_at, updated_at;
    `;
    const userResult = await client.query(userInsertQuery, [first_name, last_name, email, password_hash, role_id]);
    const newUser = userResult.rows[0];

    if (!newUser) {
      throw new Error('User creation failed.');
    }

    // If expertDetails are provided and role signifies an expert, insert into experts table
    if (expertDetails && newUser.user_id) {
      // We might need to fetch role_name if not implicitly known that this role_id IS an expert
      // For now, assume if expertDetails is present, it's an expert.
      const { cv_path, availability } = expertDetails;
      const expertInsertQuery = `
        INSERT INTO experts (user_id, cv_path, availability)
        VALUES ($1, $2, $3)
        RETURNING expert_id, cv_path, availability;
      `;
      const expertResult = await client.query(expertInsertQuery, [newUser.user_id, cv_path, availability]);
      if (!expertResult.rows[0]) {
        throw new Error('Expert details creation failed.');
      }
      newUser.expert_details = expertResult.rows[0]; // Attach expert details to the user object
    }

    await client.query('COMMIT'); // Commit transaction

    // Fetch role_name to include in the returned user object
    const roleQuery = 'SELECT role_name FROM roles WHERE role_id = $1;';
    const roleResult = await db.query(roleQuery, [newUser.role_id]); // Use db.query for simplicity here, or pass client
    if (roleResult.rows[0]) {
      newUser.role_name = roleResult.rows[0].role_name;
    }


    // Remove password_hash from the returned object for security
    delete newUser.password_hash;

    return newUser;

  } catch (error) {
    if (client) {
      await client.query('ROLLBACK'); // Rollback transaction on error
    }
    console.error('Error creating user:', error);
    if (error.code === '23505' && error.constraint === 'users_email_key') {
      throw new Error('Email already exists.');
    }
    throw error; // Rethrow to be handled by the controller
  } finally {
    if (client) {
      client.release(); // Release client back to the pool
    }
  }
}


/**
 * Retrieves user details by user ID, including their role name.
 * @param {number} userId The ID of the user to retrieve.
 * @returns {Promise<object|null>} The user object with role_name, or null if not found.
 */
async function findUserById(userId) {
  const queryText = `
    SELECT u.user_id, u.first_name, u.last_name, u.email, u.is_active, u.role_id, r.role_name,
           e.expert_id, e.cv_path, e.availability
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    LEFT JOIN experts e ON u.user_id = e.user_id
    WHERE u.user_id = $1;
  `;
  try {
    const { rows } = await db.query(queryText, [userId]);
    if (rows[0]) {
        const user = rows[0];
        // Consolidate expert details into an object if they exist
        if (user.expert_id) {
            user.expert_details = {
                expert_id: user.expert_id,
                cv_path: user.cv_path,
                availability: user.availability
            };
        }
        delete user.expert_id;
        delete user.cv_path;
        delete user.availability;
        return user;
    }
    return null;
  } catch (error) {
    console.error('Error finding user by ID:', error);
    throw error;
  }
}


module.exports = {
  findUserByEmail,
  createUser,
  findUserById,
  updateUserPassword, // Added new function
};

/**
 * Updates a user's password.
 * @param {number} userId The ID of the user.
 * @param {string} hashedPassword The new, already hashed password.
 * @returns {Promise<boolean>} True if password was updated, false if user not found.
 */
async function updateUserPassword(userId, hashedPassword) {
  const queryText = `
    UPDATE users
    SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $2
    RETURNING user_id;
  `;
  try {
    const { rowCount } = await db.query(queryText, [hashedPassword, userId]);
    return rowCount > 0;
  } catch (error) {
    console.error('Error updating user password:', error);
    throw error;
  }
}
