const createApp = require('./app');
const port = process.env.PORT || 3000;

// Create the app with rate limiting enabled by default
const app = createApp({ enableRateLimiter: process.env.RATE_LIMIT !== 'false' });

app.listen(port, () => {
  console.log('Application started on port', port);
});
