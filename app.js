const express = require('express');
const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Environment variable configuration with defaults
const CONFIG = {
  RATE_LIMITS: {
    UPLOAD: {
      windowMs: (parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000, // Convert minutes to ms
      max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX) || 10
    },
    PAGE: {
      windowMs: (parseInt(process.env.PAGE_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000, // Convert minutes to ms
      max: parseInt(process.env.PAGE_RATE_LIMIT_MAX) || 20
    }
  },
  UPLOAD: {
    maxFiles: parseInt(process.env.MAX_FILES) || 1,
    maxFileSize: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) * 1024 * 1024 : Infinity, // Convert MB to bytes
    abortOnLimit: process.env.ABORT_ON_LIMIT !== 'false',
    safeFileNames: process.env.SAFE_FILE_NAMES !== 'false',
    allowedMimeTypes: process.env.ALLOWED_MIME_TYPES?.split(','),
    allowedExtensions: process.env.ALLOWED_EXTENSIONS?.split(',')
  },
  LOGGING: {
    enabled: process.env.LOGGING_ENABLED !== 'false'
  }
};

class CustomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

class ValidationError extends CustomError {
  constructor(message) {
    super(message, 400);
  }
}

class ServerError extends CustomError {
  constructor(message = 'Internal server error') {
    super(message, 500);
  }
}

class FileValidator {
  static validateMimeType(file) {
    if (!CONFIG.UPLOAD.allowedMimeTypes) return true;
    return CONFIG.UPLOAD.allowedMimeTypes.includes(file.mimetype);
  }

  static validateExtension(filename) {
    if (!CONFIG.UPLOAD.allowedExtensions) return true;
    const ext = path.extname(filename).toLowerCase().substring(1);
    return CONFIG.UPLOAD.allowedExtensions.includes(ext);
  }

  static validateFile(file) {
    if (!this.validateMimeType(file)) {
      throw new ValidationError('Unsupported file type');
    }
    if (!this.validateExtension(file.name)) {
      throw new ValidationError('Unsupported file extension');
    }
  }
}

class FileUploadService {
  static validateKey(key) {
    return /^[a-zA-Z0-9_-]+$/.test(key);
  }

  static validateEnvironmentKeys() {
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('KEY_')) continue;

      const keyValue = key.replace('KEY_', '');
      if (!this.validateKey(keyValue)) {
        throw new ValidationError(`Invalid environment key detected: ${key}`);
      }

      if (!value || !path.resolve(value).startsWith(process.env.ALLOWED_UPLOAD_DIR)) {
        throw new ValidationError(`Invalid path for environment key: ${key}`);
      }
    }
  }

  static getValidatedKey(key) {
    if (!key || !process.env[`KEY_${key}`]) {
      throw new ValidationError('Invalid key provided');
    }

    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!this.validateKey(sanitizedKey)) {
      throw new ValidationError('Invalid key format');
    }

    return sanitizedKey;
  }

  static getValidatedPath(key) {
    const uploadPath = process.env[`KEY_${key}`];
    const resolvedPath = path.resolve(uploadPath);

    if (!uploadPath || !resolvedPath.startsWith(process.env.ALLOWED_UPLOAD_DIR)) {
      throw new ValidationError('Invalid upload path');
    }

    return path.join(uploadPath);
  }

  static async handleUpload(req, res, next) {
    try {
      if (!req.files?.data) {
        throw new ValidationError('File not provided');
      }

      FileValidator.validateFile(req.files.data);
      
      const key = this.getValidatedKey(req.query.key);
      const uploadPath = this.getValidatedPath(key);
      
      try {
        await req.files.data.mv(uploadPath);
      } catch (error) {
        next(new ServerError('File operation failed'));
        return;
      }
      
      req.logger.info(`Upload successful for ${key}`);
      return res.status(201).send('Upload successful');
    } catch (error) {
      next(error);
    }
  }
}

const createLogger = (req, res, next) => {
  if (!CONFIG.LOGGING.enabled) {
    req.logger = { info: () => {}, error: () => {} };
    return next();
  }

  req.logger = {
    info: (message) => console.log(`[${req.ip}] [201] ${message}`),
    error: (message, code) => console.log(`[${req.ip}] [${code}] Upload failed with: ${message}`)
  };
  next();
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  let message = err instanceof CustomError ? err.message : 'Could not process upload';
  
  req.logger.error(err.message, statusCode);
  res.status(statusCode).send(message);
};

function createApp({ 
  enableRateLimiter = process.env.ENABLE_RATE_LIMITER !== 'false',
  fileSizeLimit = CONFIG.UPLOAD.maxFileSize
} = {}) {
  FileUploadService.validateEnvironmentKeys();

  const app = express();
  app.use(createLogger);
  
  app.use(fileUpload({
    limits: {
      fileSize: fileSizeLimit,
      files: CONFIG.UPLOAD.maxFiles
    },
    abortOnLimit: CONFIG.UPLOAD.abortOnLimit,
    safeFileNames: CONFIG.UPLOAD.safeFileNames
  }));

  const createLimiter = (config) => enableRateLimiter 
    ? rateLimit({
        windowMs: config.windowMs,
        max: config.max,
        message: 'Too many requests, please try again later'
      }) 
    : (req, res, next) => next();

  app.get('/', createLimiter(CONFIG.RATE_LIMITS.PAGE), (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.post('/upload', createLimiter(CONFIG.RATE_LIMITS.UPLOAD), FileUploadService.handleUpload.bind(FileUploadService));

  app.all('*', (req, res, next) => {
    next(new ValidationError('That request is not supported'));
  });

  app.use(errorHandler);

  return app;
}

module.exports = {
  FileUploadService,
  createApp,
  ValidationError,
  ServerError,
  createLogger,
  errorHandler,
  CONFIG
};