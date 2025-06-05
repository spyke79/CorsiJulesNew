const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Define allowed file types
const allowedMimeTypes = [
  'application/pdf', // PDF
  'application/msword', // DOC
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.ms-excel', // XLS
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  // Add other document types as needed: ODT, ODS, TXT, CSV etc.
  'application/vnd.oasis.opendocument.text', // ODT
  'application/vnd.oasis.opendocument.spreadsheet', // ODS
  'text/plain', // TXT
  'text/csv', // CSV
];

// Configure disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Project ID should be part of the route, e.g., /api/projects/:projectId/documents
    const projectId = req.params.projectId;
    if (!projectId) {
      return cb(new Error('Project ID is missing for upload destination.'), null);
    }
    // Ensure projectId is a safe directory name (e.g. integer)
    if (!/^\d+$/.test(projectId)) {
        return cb(new Error('Invalid Project ID format for upload destination.'), null);
    }

    // Base uploads directory - ensure this 'uploads' directory exists at the root of your backend project
    // Or use an absolute path configured elsewhere
    const baseUploadsPath = path.join(__dirname, '..', 'uploads');
    const projectDocsPath = path.join(baseUploadsPath, 'project_docs', `project_${projectId}`);

    // Create the directory if it doesn't exist
    // fs.mkdirSync is okay here as multer calls this function per file,
    // but for high concurrency, consider async or ensure dir exists beforehand.
    // However, fs.mkdirSync can block. Let's use fs.mkdir with callback.
    fs.mkdir(projectDocsPath, { recursive: true }, (err) => {
      if (err) {
        console.error("Failed to create directory for upload:", err);
        return cb(err, null);
      }
      cb(null, projectDocsPath);
    });
  },
  filename: function (req, file, cb) {
    // Sanitize filename: remove special characters, ensure uniqueness, etc.
    // For now, keep original name but add a timestamp prefix for uniqueness to avoid overwrites.
    // A more robust solution might involve slugifying the filename and checking for collisions.
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'); // Basic sanitize
    cb(null, `${timestamp}-${originalName}`);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    console.log(`Rejected file type: ${file.mimetype} for ${file.originalname}`);
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, ODT, ODS, TXT, CSV are allowed.'), false); // Reject file
  }
};

// Multer upload instance
const uploadProjectDocument = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 10 // 10 MB file size limit (adjust as needed)
  }
}).single('document'); // Expects a single file in a field named 'document'

module.exports = {
  uploadProjectDocument,
};
