const express = require('express');
const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const fileSize = (process.env.FILESIZE || Infinity) * 1024 * 1024; // Convert FILESIZE from MB to bytes

const files = 1;
const abortOnLimit = true;
const safeFileNames = true;
const limits = { fileSize, files };
const options = { safeFileNames, limits, abortOnLimit };

function isValidKey(key) {
  // Ensure the key only contains valid characters
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

// Validate environment keys on startup
function validateEnvironmentKeys() {
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('KEY_')) {
      const keyValue = key.replace('KEY_', '');
      if (!isValidKey(keyValue)) {
        throw new Error(`Invalid environment key detected: ${key}`);
      }
      if (!value || !path.resolve(value).startsWith(process.env.ALLOWED_UPLOAD_DIR)) {
        throw new Error(`Invalid path for environment key: ${key}`);
      }
    }
  }
}

validateEnvironmentKeys();

// Rate limiting middleware
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each key to 10 upload requests per windowMs
  message: 'Too many upload requests from this IP, please try again after 15 minutes'
});

const pageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests to the main page per windowMs
  message: 'Too many requests to the page, please try again later'
});

function handleUpload(req, res, next) {
  const notProvided = new Error('File not provided');
  const invalidKey = new Error('Invalid key provided');

  // Validate that the file and key are provided
  if (!req.files || !req.files.data) return next(notProvided);
  if (!req.query.key || !process.env['KEY_' + req.query.key]) return next(invalidKey);

  // Sanitize and validate the key input to prevent any directory traversal attacks
  const key = req.query.key.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!isValidKey(key) || !process.env['KEY_' + key]) {
    return next(invalidKey);
  }

  const uploadPath = process.env['KEY_' + key];

  // Ensure the destination directory is valid and inside allowed directories
  if (!uploadPath || !path.resolve(uploadPath).startsWith(process.env.ALLOWED_UPLOAD_DIR)) {
    return next(new Error('Invalid upload path'));
  }

  // Overwrite the file in the target directory securely
  const newFilePath = path.join(uploadPath);

  // Move the file to the target directory securely
  req.files.data.mv(newFilePath, (err) => {
    if (err) return next(err);
    console.log(`[${req.ip}] [201] Upload successful for ${key}`);
    res.status(201).send('Upload successful');
  });
}

function handleInvalidRequests(req, res) {
  throw new Error('That request is not supported');
}

function handleError(err, req, res, next) {
  const code =
    err.message == 'File not provided' ||
    err.message == 'Invalid key provided' ||
    err.message == 'That request is not supported' ||
    err.message == 'Invalid upload path' ? 400 : 500;
  const response = code == 400 ? err.message : 'Could not process upload';
  console.log(`[${req.ip}] [${code}] Upload failed with: ${err.message}`);
  res.status(code).send(response);
}

const app = express();
app.use(fileUpload(options));

// Serve the HTML page with rate limiting
app.get('/', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// File upload route with rate limiting
app.post('/upload', uploadLimiter, handleUpload);
app.all('*', handleInvalidRequests);
app.use(handleError);

module.exports = app;
