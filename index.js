const { createApp } = require('./app');

const port = process.env.PORT || 3000;

// Create the app with configurations from environment variables
const app = createApp({
  enableRateLimiter: process.env.ENABLE_RATE_LIMITER !== 'false',
  fileSizeLimit: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) * 1024 * 1024 : Infinity
});

app.listen(port, () => {
  console.log(`Application started on port ${port}`);
  console.log('Rate limiting:', process.env.ENABLE_RATE_LIMITER !== 'false' ? 'enabled' : 'disabled');
  console.log('Max file size:', process.env.MAX_FILE_SIZE ? `${process.env.MAX_FILE_SIZE}MB` : 'unlimited');
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  process.exit(1);
});