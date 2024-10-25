const fs = require('fs');
const request = require('supertest');
const app = require('./app');

describe('/upload', () => {
  beforeAll(() => {
    process.env['ALLOWED_UPLOAD_DIR'] = '/tmp';
  });

  afterAll(() => {
    delete process.env['ALLOWED_UPLOAD_DIR'];
  });

  test('it should accept a file upload', async () => {
    process.env['KEY_TEST'] = '/tmp/AWEJA_testfile.txt';
    const name = 'test.txt';
    const url = '/upload?key=TEST';
    const file = Buffer.from('This is a test file', 'utf8');
    const res = await request(app).post(url).attach('data', file, name);
    expect(res.status).toEqual(201);
    expect(res.text).toEqual('Upload successful');
    expect(fs.existsSync('/tmp/AWEJA_testfile.txt')).toEqual(true);
    fs.unlinkSync('/tmp/AWEJA_testfile.txt');
    delete process.env['KEY_TEST'];
  });

  test('it should error for unknown requests', async () => {
    const res = await request(app).get('/unknown');
    expect(res.status).toEqual(400);
    expect(res.text).toEqual('That request is not supported');
  });

  test('it should fail when no file is provided', async () => {
    process.env['KEY_TEST'] = '/tmp/AWEJA_testfile.txt';
    const res = await request(app).post('/upload?key=TEST');
    expect(res.status).toEqual(400);
    expect(res.text).toEqual('File not provided');
    delete process.env['KEY_TEST'];
  });

  test('it should fail when no key is provided', async () => {
    const name = 'test.txt';
    const file = Buffer.from('This is a test file', 'utf8');
    const res = await request(app).post('/upload').attach('data', file, name);
    expect(res.status).toEqual(400);
    expect(res.text).toEqual('Invalid key provided');
  });

  test('it should fail for invalid key characters', async () => {
    process.env['KEY_INVALID'] = '/tmp/invalidfile.txt';
    const name = 'test.txt';
    const file = Buffer.from('This is a test file', 'utf8');
    const url = '/upload?key=INVALID$$';
    const res = await request(app).post(url).attach('data', file, name);
    expect(res.status).toEqual(400);
    expect(res.text).toEqual('Invalid key provided');
    delete process.env['KEY_INVALID'];
  });

  test('it should fail for directory traversal in key', async () => {
    process.env['KEY_TEST'] = '/tmp/AWEJA_testfile.txt';
    const name = 'test.txt';
    const file = Buffer.from('This is a test file', 'utf8');
    const url = '/upload?key=../TEST';
    const res = await request(app).post(url).attach('data', file, name);
    expect(res.status).toEqual(400);
    expect(res.text).toEqual('Invalid key provided');
    delete process.env['KEY_TEST'];
  });

  test('it should fail for invalid upload path', async () => {
    process.env['KEY_TEST'] = '/unauthorized_dir/testfile.txt';
    const name = 'test.txt';
    const file = Buffer.from('This is a test file', 'utf8');
    const url = '/upload?key=TEST';
    const res = await request(app).post(url).attach('data', file, name);
    expect(res.status).toEqual(400);
    expect(res.text).toEqual('Invalid upload path');
    delete process.env['KEY_TEST'];
  });

  test('it should rate limit excessive uploads', async () => {
    process.env['KEY_TEST'] = '/tmp/AWEJA_testfile.txt';
    const name = 'test.txt';
    const file = Buffer.from('This is a test file', 'utf8');
    const url = '/upload?key=TEST';
    
    // Send 10 requests (should pass)
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post(url).attach('data', file, name);
      expect(res.status).toEqual(201);
      expect(res.text).toEqual('Upload successful');
    }

    // 11th request should be rate limited
    const res = await request(app).post(url).attach('data', file, name);
    expect(res.status).toEqual(429);
    expect(res.text).toEqual('Too many upload requests from this IP, please try again after 15 minutes');

    delete process.env['KEY_TEST'];
  });
});

describe('GET /', () => {
  test('it should serve the index.html page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toEqual(200);
    expect(res.header['content-type']).toMatch(/html/);
  });

  test('it should rate limit excessive page requests', async () => {
    // Send 20 requests (should pass)
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get('/');
      expect(res.status).toEqual(200);
      expect(res.header['content-type']).toMatch(/html/);
    }

    // 21st request should be rate limited
    const res = await request(app).get('/');
    expect(res.status).toEqual(429);
    expect(res.text).toEqual('Too many requests to the page, please try again later');
  });
});
