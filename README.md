# simple-file-upload

Docker container that provides an API endpoint for simple, secure file uploads.

## Overview

This container exposes a single, write-only endpoint at `/upload` that accepts a file upload along with a `key` parameter for authentication. Authentication and upload locations are configured via environment variables.

Basic example:
```bash
curl -XPOST -F 'data=@testuser-file.txt' dockerhost:3000/upload?key=TESTUSER
```

## Design Goals

1. Write-only uploads - no file reading or downloading
2. Authentication key required for all uploads
3. One-to-one mapping of keys to upload locations
4. Single file per key - new uploads override previous ones
5. Strict validation of keys and paths for security
6. Rate limiting to prevent abuse
7. Configurable file size and type restrictions

## Configuration

### Required Environment Variables

- `ALLOWED_UPLOAD_DIR`: Base directory for all uploads (e.g., `/uploads/`)
- At least one key-path mapping: `KEY_<NAME>=<PATH>` (e.g., `KEY_TESTUSER=/uploads/testuser-file.txt`)

### Optional Environment Variables

#### File Upload Settings
- `MAX_FILE_SIZE`: Maximum file size in MB (default: unlimited)
- `MAX_FILES`: Maximum number of files per upload (default: 1)
- `ABORT_ON_LIMIT`: Stop upload if limits exceeded (default: true)
- `SAFE_FILE_NAMES`: Sanitize filenames (default: true)
- `ALLOWED_MIME_TYPES`: Comma-separated list of allowed MIME types (default: all)
- `ALLOWED_EXTENSIONS`: Comma-separated list of allowed file extensions (default: all)

#### Rate Limiting
- `ENABLE_RATE_LIMITER`: Enable/disable rate limiting (default: true)
- `UPLOAD_RATE_LIMIT_WINDOW_MS`: Time window for upload rate limiting in ms (default: 900000 - 15 minutes)
- `UPLOAD_RATE_LIMIT_MAX`: Maximum uploads per window (default: 10)
- `PAGE_RATE_LIMIT_WINDOW_MS`: Time window for page access rate limiting in ms (default: 900000)
- `PAGE_RATE_LIMIT_MAX`: Maximum page accesses per window (default: 20)

#### Logging
- `LOGGING_ENABLED`: Enable/disable request logging (default: true)

## Docker Usage

Basic example:
```bash
docker run \
  -e "KEY_TESTUSER=/uploads/testuser-file.txt" \
  -e "ALLOWED_UPLOAD_DIR=/uploads/" \
  -e "MAX_FILE_SIZE=50" \
  -v /my_local_dir/:/uploads/ \
  -p 3000:3000 \
  bertybuttface/simple-file-upload
```

### Advanced Configuration Example
```bash
docker run \
  -e "KEY_TESTUSER=/uploads/testuser-file.txt" \
  -e "KEY_USER2=/uploads/user2-file.pdf" \
  -e "ALLOWED_UPLOAD_DIR=/uploads/" \
  -e "MAX_FILE_SIZE=50" \
  -e "ALLOWED_EXTENSIONS=txt,pdf,jpg" \
  -e "ALLOWED_MIME_TYPES=text/plain,application/pdf,image/jpeg" \
  -e "UPLOAD_RATE_LIMIT_MAX=5" \
  -e "UPLOAD_RATE_LIMIT_WINDOW_MS=300000" \
  -v /my_local_dir/:/uploads/ \
  -p 3000:3000 \
  bertybuttface/simple-file-upload
```

## Security Features

1. **Path Validation**: All upload paths must be within `ALLOWED_UPLOAD_DIR`
2. **Key Validation**: Keys can only contain alphanumeric characters, dashes, or underscores
3. **Rate Limiting**: Prevents abuse through configurable request limits
4. **File Validation**: Optional MIME type and extension restrictions
5. **Startup Validation**: Validates all environment variables and paths before starting

## Error Handling

- 400: Validation errors (invalid key, file type, etc.)
- 413: File size exceeded
- 429: Rate limit exceeded
- 500: Server errors (file system issues, etc.)

## Notes

- Files are overwritten if uploaded to the same key
- All paths in key mappings must be within `ALLOWED_UPLOAD_DIR`
- Rate limiting is per IP address
- File size limits are in megabytes
- MIME types and extensions are case-insensitive
