const express = require('express');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const projectRoutes = require('./routes/projectRoutes');
const courseRoutes = require('./routes/courseRoutes');
const expertRoutes = require('./routes/expertRoutes');
const calendarLessonRoutes = require('./routes/calendarLessonRoutes'); // Import lesson routes

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Mount authentication routes
// All routes defined in authRoutes will be prefixed with /api/auth
app.use('/api/auth', authRoutes);

// Mount dashboard routes
// All routes defined in dashboardRoutes will be prefixed with /api/dashboard
app.use('/api/dashboard', dashboardRoutes);

// Mount school routes
// All routes defined in schoolRoutes will be prefixed with /api/schools
app.use('/api/schools', schoolRoutes);

// Mount project routes
// projectRoutes handles /api/projects/* and /api/schools/:schoolId/projects
app.use('/api', projectRoutes);

// Mount course routes
// courseRoutes handles /api/courses/* and /api/projects/:projectId/courses
app.use('/api', courseRoutes);

// Mount expert routes
// expertRoutes handles /api/experts/*
app.use('/api/experts', expertRoutes);

// Mount calendar lesson routes
// calendarLessonRoutes handles /api/lessons/* and /api/courses/:courseId/lessons
app.use('/api', calendarLessonRoutes);


// Basic route for testing if the server is up
app.get('/', (req, res) => {
  res.send('Backend server is running.');
});

// Basic Error Handling Middleware
// This should be defined after all other app.use() and routes calls
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000; // Use environment variable for port or default to 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; // Export app for potential testing or other uses
