require('dotenv').config();
const express = require('express');
const { validateWebhookSignature, extractPullRequestData } = require('./webhookHandler');
const { fetchPullRequestDiff, fetchPullRequestFiles } = require('./diffFetcher');
const { cleanAndStructureDiff } = require('./diffCleaner');
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
    
    // Week 2: Fetch and process PR diff
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      logger.error('GITHUB_TOKEN not configured');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'GITHUB_TOKEN is required for diff fetching'
      });
    }
    
    let cleanedDiff = [];
    
    try {
      // Fetch PR diff and files metadata
      const [rawDiff, files] = await Promise.all([
        fetchPullRequestDiff(prData.repository, prData.pullRequestNumber, githubToken),
        fetchPullRequestFiles(prData.repository, prData.pullRequestNumber, githubToken)
      ]);
      
      // Clean and structure the diff
      const cleanedDiffData = cleanAndStructureDiff(rawDiff, files);
      cleanedDiff = cleanedDiffData.files;
      
      logger.info('Diff processing completed', {
        repository: prData.repository,
        pullRequestNumber: prData.pullRequestNumber,
        filesProcessed: cleanedDiffData.totalFiles,
        totalChangesBytes: cleanedDiffData.totalChanges
      });
      
    } catch (error) {
      logger.error('Error fetching or cleaning diff', {
        repository: prData.repository,
        pullRequestNumber: prData.pullRequestNumber,
        error: error.message,
        stack: error.stack
      });
      
      // Return error but don't fail the webhook - log the issue
      return res.status(500).json({
        error: 'Failed to fetch or process PR diff',
        message: error.message,
        repository: prData.repository,
        pullRequestNumber: prData.pullRequestNumber
      });
    }
    
    // Week 2 Output Format
    const week2Output = {
      repository: prData.repository,
      pullRequestNumber: prData.pullRequestNumber,
      cleanedDiff: cleanedDiff,
      preparedAt: new Date().toISOString()
    };
    
    // Log successful processing
    const processingTime = Date.now() - startTime;
    logger.info('Pull request event processed successfully', {
      ...prData,
      deliveryId,
      processingTimeMs: processingTime,
      diffFiles: cleanedDiff.length
    });
    
    // Return Week 2 formatted response
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: week2Output
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
  
  if (!process.env.GITHUB_TOKEN) {
    logger.warn('WARNING: GITHUB_TOKEN not set. Diff fetching will fail.');
  }
});

module.exports = app;

