require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./utils/db');
const startWorker = require('./workers/reviewWorker');
const { handleWebhook } = require('./controllers/webhookController');
const dashboardController = require('./controllers/dashboardController');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Database
connectDB();

// Start BullMQ Worker
startWorker();

// Production Hardening
app.use(helmet({
  contentSecurityPolicy: false, // For local dev/simplicity if needed, but helmet is good
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

// Middleware
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Routes
app.post('/github/webhook', handleWebhook);
app.use('/api', limiter, dashboardController);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'GitGuard AI SaaS' });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  logger.error('Centralized Error Handler', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  logger.info(`🚀 GitGuard AI SaaS Backend running on port ${PORT}`);
});

module.exports = app;
