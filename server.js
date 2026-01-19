require('dotenv').config();
const express = require('express');
const { validateWebhookSignature, extractPullRequestData } = require('./webhookHandler');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware: Parse JSON bodies
app.use(express.json({
  verify: (req, res, buf) => {
    // Store raw body for signature verification
    req.rawBody = buf;
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'GitGuard AI Webhook Listener' });
});

// GitHub webhook endpoint
app.post('/github/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Extract required headers
    const eventType = req.headers['x-github-event'];
    const signature = req.headers['x-hub-signature-256'];
    const deliveryId = req.headers['x-github-delivery'];
    
    logger.info('Webhook received', {
      eventType,
      deliveryId,
      timestamp: new Date().toISOString()
    });
    
    // Validate required headers
    if (!eventType || !signature || !deliveryId) {
      logger.warn('Missing required headers', {
        eventType: !!eventType,
        signature: !!signature,
        deliveryId: !!deliveryId
      });
      return res.status(400).json({
        error: 'Missing required headers',
        required: ['X-GitHub-Event', 'X-Hub-Signature-256', 'X-GitHub-Delivery']
      });
    }
    
    // Validate webhook signature
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('GITHUB_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const isValidSignature = validateWebhookSignature(
      req.rawBody,
      signature,
      webhookSecret
    );
    
    if (!isValidSignature) {
      logger.warn('Invalid webhook signature', { deliveryId });
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Filter events: Only process pull_request events
    if (eventType !== 'pull_request') {
      logger.info('Event ignored (not a pull_request)', { eventType, deliveryId });
      return res.status(200).json({
        message: 'Event received but ignored',
        eventType,
        reason: 'Only pull_request events are processed'
      });
    }
    
    // Extract and validate pull request data
    const prData = extractPullRequestData(req.body);
    
    if (!prData) {
      logger.warn('Invalid pull request event data', { deliveryId });
      return res.status(400).json({
        error: 'Invalid pull request event data',
        reason: 'Missing required fields or unsupported action'
      });
    }
    
    // Log successful processing
    const processingTime = Date.now() - startTime;
    logger.info('Pull request event processed successfully', {
      ...prData,
      deliveryId,
      processingTimeMs: processingTime
    });
    
    // Return success response
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: prData
    });
    
  } catch (error) {
    logger.error('Error processing webhook', {
      error: error.message,
      stack: error.stack,
      deliveryId: req.headers['x-github-delivery']
    });
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process webhook'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error handler', {
    error: err.message,
    stack: err.stack
  });
  
  res.status(500).json({
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  logger.info('GitGuard AI Webhook Listener started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    endpoint: `/github/webhook`
  });
  
  if (!process.env.GITHUB_WEBHOOK_SECRET) {
    logger.warn('WARNING: GITHUB_WEBHOOK_SECRET not set. Webhook validation will fail.');
  }
});

module.exports = app;

