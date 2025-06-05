const { Pool } = require('pg');

// Placeholder for database connection details
// These should ideally be configured using environment variables
const pool = new Pool({
  user: process.env.DB_USER || 'postgres', // Default to 'postgres' if not set
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres', // Default to 'postgres' database
  password: process.env.DB_PASSWORD || 'password', // Replace with a secure default or ensure it's set via ENV
  port: process.env.DB_PORT || 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(), // Export a method to get a client from the pool
  pool, // Export the pool itself if more advanced pool operations are needed
};

// Example of how to use it (optional, for testing)
/*
async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('Connected to PostgreSQL, current time:', res.rows[0].now);
  } catch (err) {
    console.error('Connection error', err.stack);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// testConnection(); // Uncomment to test connection when this file is run directly
*/
