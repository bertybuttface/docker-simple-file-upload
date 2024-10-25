# simple-file-upload

Docker container that provides an API endpoint for simple, secure file uploads.

This Docker container exposes a single, write-only endpoint at `/upload` that accepts a single file along with a `key` GET parameter for authentication. The authentication for the endpoint, along with the location of the uploaded file, is configured using environment variables on the container.

You can upload a file with curl like so:

```bash
> curl -XPOST -F 'data=@testuser-file.txt' dockerhost:3000/upload?key=TESTUSER
```

Multiple keys are supported, and every key is a 1:1 mapping to a location on disk. Any additional uploads for a key will override the previous upload for that key.

The design goals for this container are a secure upload tool that:

1. Can only be used to upload files, not download or read them
2. Can only be used with a matching authentication key
3. Can only upload to a single location per authentication key
4. Can only override the previous upload, not store additional uploads
5. Enforces validation of authentication keys and their associated paths on startup to ensure security
6. Rate limits the number of requests to prevent abuse and denial of service, including rate limiting access to the main HTML page (`index.html`) to prevent unauthorized excessive access
7. Configurable file size limits to avoid excessive data being uploaded

### New Features
- **Environment Key Validation on Startup**: At startup, all environment keys (`KEY_*`) are validated to ensure they only contain alphanumeric characters, dashes, or underscores. This prevents misconfiguration and potential security issues from using invalid keys.
- **Path Restriction**: The paths provided via environment variables are now validated to ensure they are within the allowed upload directory (`ALLOWED_UPLOAD_DIR`). This prevents unauthorized file access outside of the designated directory structure.
- **Rate Limiting Middleware**: Rate limiting has been added to restrict the number of requests that can be made to the `/upload` endpoint in a given time frame. Additionally, rate limiting is applied to access the `index.html` page to prevent abuse.
- **File Size Limit Configuration**: The maximum file size that can be uploaded can now be configured using the `FILESIZE` environment variable. This prevents excessively large files from being uploaded, which could impact server performance.

# How to Use

Basic usage is as follows:

```bash
docker run \
  -e "KEY_TESTUSER=/uploads/testuser-file.txt" \
  -e "ALLOWED_UPLOAD_DIR=/uploads/" \
  -e "FILESIZE=50" \
  -v /my_local_dir/:/uploads/ \
  -p 3000:3000 \
  bertybuttface/simple-file-upload
```

This will start the upload server, listening on port 3000. Files that are uploaded with the key `TESTUSER` will be placed at `/uploads/testuser-file.txt`. You can use a volume to get easy access to this file on your host machine or in another container.

The additional `ALLOWED_UPLOAD_DIR` environment variable ensures that all uploads are constrained to a specific directory, preventing potential unauthorized writes to unintended locations. The `FILESIZE` environment variable allows you to set the maximum allowable file size for uploads (in megabytes).

Let me know if you have any questions or need further adjustments!
