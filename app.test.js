const fs = require('fs');
const request = require('supertest');
const { FileUploadService, createApp } = require('./app');

describe('FileUploadService', () => {
  describe('validateKey', () => {
    test('should validate correct keys', () => {
      expect(FileUploadService.validateKey('TEST')).toBe(true);
      expect(FileUploadService.validateKey('test-123')).toBe(true);
      expect(FileUploadService.validateKey('test_123')).toBe(true);
    });

    test('should invalidate incorrect keys', () => {
      expect(FileUploadService.validateKey('TEST$')).toBe(false);
      expect(FileUploadService.validateKey('../test')).toBe(false);
      expect(FileUploadService.validateKey('test/')).toBe(false);
    });
  });
});

describe('Upload Server', () => {
  let app;
  const TEST_FILE_PATH = '/tmp/AWEJA_testfile.txt';
  const TEST_FILE_CONTENT = 'This is a test file';
  const TEST_FILE_NAME = 'test.txt';

  beforeAll(() => {
    process.env.ALLOWED_UPLOAD_DIR = '/tmp';
  });

  beforeEach(() => {
    app = createApp({ enableRateLimiter: false });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_FILE_PATH)) {
      fs.unlinkSync(TEST_FILE_PATH);
    }
    delete process.env.KEY_TEST;
  });

  afterAll(() => {
    delete process.env.ALLOWED_UPLOAD_DIR;
  });

  describe('/upload', () => {
    describe('successful uploads', () => {
      test('should accept a valid file upload', async () => {
        process.env.KEY_TEST = TEST_FILE_PATH;
        const file = Buffer.from(TEST_FILE_CONTENT, 'utf8');
        
        const res = await request(app)
          .post('/upload?key=TEST')
          .attach('data', file, TEST_FILE_NAME);

        expect(res.status).toBe(201);
        expect(res.text).toBe('Upload successful');
        expect(fs.existsSync(TEST_FILE_PATH)).toBe(true);
        expect(fs.readFileSync(TEST_FILE_PATH, 'utf8')).toBe(TEST_FILE_CONTENT);
      });

      test('should handle multiple valid sequential uploads', async () => {
        process.env.KEY_TEST = TEST_FILE_PATH;
        const file = Buffer.from(TEST_FILE_CONTENT, 'utf8');
        
        for (let i = 0; i < 3; i++) {
          const res = await request(app)
            .post('/upload?key=TEST')
            .attach('data', file, TEST_FILE_NAME);

          expect(res.status).toBe(201);
          expect(res.text).toBe('Upload successful');
        }
      });
    });

    describe('validation errors', () => {
      test('should fail when no file is provided', async () => {
        process.env.KEY_TEST = TEST_FILE_PATH;
        
        const res = await request(app)
          .post('/upload?key=TEST');

        expect(res.status).toBe(400);
        expect(res.text).toBe('File not provided');
      });

      test('should fail when no key is provided', async () => {
        const file = Buffer.from(TEST_FILE_CONTENT, 'utf8');
        
        const res = await request(app)
          .post('/upload')
          .attach('data', file, TEST_FILE_NAME);

        expect(res.status).toBe(400);
        expect(res.text).toBe('Invalid key provided');
      });

      test('should fail for invalid key characters', async () => {
        process.env.KEY_INVALID = '/tmp/invalidfile.txt';
        const file = Buffer.from(TEST_FILE_CONTENT, 'utf8');
        
        const res = await request(app)
          .post('/upload?key=INVALID$$')
          .attach('data', file, TEST_FILE_NAME);

        expect(res.status).toBe(400);
        expect(res.text).toBe('Invalid key provided');
      });

      test('should fail for directory traversal attempts', async () => {
        process.env.KEY_TEST = TEST_FILE_PATH;
        const file = Buffer.from(TEST_FILE_CONTENT, 'utf8');
        
        const res = await request(app)
          .post('/upload?key=../TEST')
          .attach('data', file, TEST_FILE_NAME);

        expect(res.status).toBe(400);
        expect(res.text).toBe('Invalid key provided');
      });

      test('should fail for invalid upload path', async () => {
        process.env.KEY_TEST = '/unauthorized_dir/testfile.txt';
        const file = Buffer.from(TEST_FILE_CONTENT, 'utf8');
        
        const res = await request(app)
          .post('/upload?key=TEST')
          .attach('data', file, TEST_FILE_NAME);

        expect(res.status).toBe(400);
        expect(res.text).toBe('Invalid upload path');
      });
    });

    describe('file size limits', () => {
      test('should fail for file size too big', async () => {
        process.env.KEY_TEST = TEST_FILE_PATH;
        const fileSizeLimit = 1 * 1024 * 1024; // 1MB
        app = createApp({ 
          enableRateLimiter: false, 
          fileSizeLimit 
        });
        
        const largeFile = Buffer.alloc(1.5 * 1024 * 1024, 'a');
        
        const res = await request(app)
          .post('/upload?key=TEST')
          .attach('data', largeFile, 'large.txt');

        expect(res.status).toBe(413);
        expect(res.text).toContain('File size limit has been reached');
      });
    });

    describe('rate limiting', () => {
      test('should rate limit excessive uploads', async () => {
        app = createApp({ enableRateLimiter: true });
        process.env.KEY_TEST = TEST_FILE_PATH;
        const file = Buffer.from(TEST_FILE_CONTENT, 'utf8');

        // Send allowed requests
        for (let i = 0; i < 10; i++) {
          const res = await request(app)
            .post('/upload?key=TEST')
            .attach('data', file, TEST_FILE_NAME);

          expect(res.status).toBe(201);
        }

        // Test rate limit
        const res = await request(app)
          .post('/upload?key=TEST')
          .attach('data', file, TEST_FILE_NAME);

        expect(res.status).toBe(429);
        expect(res.text).toBe('Too many requests, please try again later');
      });
    });
  });

  describe('GET /', () => {
    test('should serve the index.html page', async () => {
      const res = await request(app).get('/');
      
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toMatch(/html/);
    });

    test('should rate limit excessive page requests', async () => {
      app = createApp({ enableRateLimiter: true });

      // Send allowed requests
      for (let i = 0; i < 20; i++) {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
      }

      // Test rate limit
      const res = await request(app).get('/');
      expect(res.status).toBe(429);
      expect(res.text).toBe('Too many requests, please try again later');
    });
  });

  describe('error handling', () => {
    test('should handle server errors gracefully', async () => {
      // Import the required middleware
      const express = require('express');
      const { FileUploadService, createLogger, errorHandler } = require('./app');
  
      // Mock express-fileupload's mv function before creating the app
      const mockFileUpload = jest.fn().mockImplementation(() => {
        return (req, res, next) => {
          req.files = {
            data: {
              name: TEST_FILE_NAME,
              data: Buffer.from(TEST_FILE_CONTENT),
              mv: () => Promise.reject(new Error('EACCES: permission denied'))
            }
          };
          next();
        };
      });
      
      // Create new app instance with mocked fileUpload
      const testApp = express();
      testApp.use(createLogger);
      testApp.use(mockFileUpload());
      testApp.post('/upload', FileUploadService.handleUpload);
      testApp.use(errorHandler);
  
      process.env.KEY_TEST = TEST_FILE_PATH;
      
      const res = await request(testApp)
        .post('/upload?key=TEST');
  
      expect(res.status).toBe(500);
      expect(res.text).toBe('Could not process upload');
    });
  });

  describe('environment validation', () => {
    test('should validate environment keys on startup', () => {
      process.env.KEY_VALID = '/tmp/valid.txt';
      process.env.KEY_INVALID$ = '/tmp/invalid.txt';
      
      expect(() => {
        createApp();
      }).toThrow('Invalid environment key detected: KEY_INVALID$');
      
      delete process.env.KEY_VALID;
      delete process.env.KEY_INVALID$;
    });

    test('should validate environment paths on startup', () => {
      process.env.KEY_TEST = '/invalid/path/file.txt';
      
      expect(() => {
        createApp();
      }).toThrow('Invalid path for environment key: KEY_TEST');
      
      delete process.env.KEY_TEST;
    });
  });
});