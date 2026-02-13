require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./db');
const { reviewQueue, connection: redisConnection } = require('./queue');
const startWorker = require('./worker');
const { validateWebhookSignature, extractPullRequestData } = require('./webhookHandler');
const { getRepositorySettings } = require('./storage');
const dashboardRoutes = require('./dashboard');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Database
connectDB();

// Start BullMQ Worker
startWorker(redisConnection);

// Production Middleware
app.use(helmet());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Middleware: Parse JSON bodies
app.use(express.json({
  verify: (req, res, buf) => {
    // Store raw body for signature verification
    req.rawBody = buf;
  }
}));

// Explicit routes for main pages (must come before static middleware)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve static files (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard API routes
app.use(dashboardRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'GitGuard AI Webhook Listener' });
});

// Store last generated prompt for viewing
let lastPrompt = null;

// Track processed webhooks to prevent duplicates (in-memory cache)
// In production, consider using Redis or a database
const processedWebhooks = new Map();
const WEBHOOK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Aggregates multiple LLM responses into a single review
 * @param {Array<Object>} responses - Array of LLM responses
 * @param {Object} prData - Pull request metadata
 * @param {number} totalFiles - Total number of files
 * @returns {Object} - Aggregated response
 */
function aggregateLLMResponses(responses, prData, totalFiles) {
  const successful = responses.filter(r => !r.failed && r.response);
  const failed = responses.filter(r => r.failed);

  if (successful.length === 0) {
    return {
      error: 'All LLM calls failed',
      provider: 'groq',
      failedCount: failed.length
    };
  }

  // Group responses by file
  const fileGroups = new Map();
  for (const response of successful) {
    const filename = response.filename || 'unknown';
    if (!fileGroups.has(filename)) {
      fileGroups.set(filename, []);
    }
    fileGroups.get(filename).push(response);
  }

  // Aggregate reviews by file
  const fileReviews = [];
  for (const [filename, fileResponses] of fileGroups.entries()) {
    // If file was chunked, combine chunks
    if (fileResponses.length > 1) {
      const sorted = fileResponses.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
      const combined = sorted.map(r => r.response).join('\n\n---\n\n');
      fileReviews.push(`### ${filename}\n\n${combined}`);
    } else {
      fileReviews.push(`### ${filename}\n\n${fileResponses[0].response}`);
    }
  }

  // Build aggregated review
  let aggregatedReview = fileReviews.join('\n\n---\n\n');

  // Add summary if many files or partial review
  const reviewedFiles = fileGroups.size;
  let partialReview = null;

  if (reviewedFiles < totalFiles) {
    partialReview = `Reviewed ${reviewedFiles} of ${totalFiles} files. Some files were skipped due to size constraints.`;
    aggregatedReview = `⚠️ **Partial Review Notice:** ${partialReview}\n\n---\n\n${aggregatedReview}`;
  }

  // Calculate total usage
  const totalUsage = successful.reduce((acc, r) => {
    if (r.usage) {
      acc.promptTokens += r.usage.promptTokens || 0;
      acc.completionTokens += r.usage.completionTokens || 0;
      acc.totalTokens += r.usage.totalTokens || 0;
    }
    return acc;
  }, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });

  return {
    provider: successful[0].provider || 'groq',
    model: successful[0].model || 'unknown',
    aggregatedReview,
    partialReview,
    usage: totalUsage,
    fileCount: reviewedFiles,
    totalFiles,
    responsesProcessed: successful.length,
    failedCount: failed.length,
    receivedAt: new Date().toISOString()
  };
}

// Endpoint to view last generated prompt (for testing/debugging)
app.get('/prompt/last', (req, res) => {
  if (!lastPrompt) {
    return res.status(404).json({
      error: 'No prompt generated yet',
      message: 'Send a webhook request first to generate a prompt'
    });
  }

  res.status(200).json({
    success: true,
    prompt: lastPrompt
  });
});

// GitHub webhook endpoint
app.post('/github/webhook', async (req, res, next) => {
  try {
    const eventType = req.headers['x-github-event'];
    const signature = req.headers['x-hub-signature-256'];
    const deliveryId = req.headers['x-github-delivery'];

    if (!eventType || !signature || !deliveryId) {
      return res.status(400).json({ error: 'Missing required headers' });
    }

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!validateWebhookSignature(req.rawBody, signature, webhookSecret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (eventType !== 'pull_request') {
      return res.status(200).json({ message: 'Event ignored (not a pull_request)' });
    }

    const prData = extractPullRequestData(req.body);
    if (!prData) {
      return res.status(400).json({ error: 'Invalid pull request data' });
    }

    const repoSettings = await getRepositorySettings(prData.repository);
    if (!repoSettings.enabled) {
      return res.status(200).json({ success: true, message: 'Reviews disabled for this repository' });
    }

    // Add job to background queue
    await reviewQueue.add(`review-${deliveryId}`, { prData, deliveryId }, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });

    res.status(202).json({
      success: true,
      message: 'Review queued for background processing',
      deliveryId
    });

  } catch (error) {
    next(error);
  }
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Centralized Error Handler', {
    error: message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  logger.info('🚀 GitGuard AI Webhook Listener started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    endpoint: `/github/webhook`
  });
  console.log('='.repeat(60));
  console.log('\n📊 Dashboard & Web Interface:');
  console.log(`   → Landing Page: http://localhost:${PORT}/`);
  console.log(`   → Dashboard:    http://localhost:${PORT}/dashboard.html`);
  console.log('\n🔗 API Endpoints:');
  console.log(`   → Webhook:      http://localhost:${PORT}/github/webhook`);
  console.log(`   → Health Check: http://localhost:${PORT}/health`);
  console.log(`   → Last Prompt:  http://localhost:${PORT}/prompt/last`);
  console.log('\n' + '='.repeat(60) + '\n');

  if (!process.env.GITHUB_WEBHOOK_SECRET) {
    logger.warn('⚠️  WARNING: GITHUB_WEBHOOK_SECRET not set. Webhook validation will fail.');
  }

  if (!process.env.GITHUB_TOKEN) {
    logger.warn('⚠️  WARNING: GITHUB_TOKEN not set. Diff fetching will fail.');
  }
});

module.exports = app;

