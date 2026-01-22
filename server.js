require('dotenv').config();
const express = require('express');
const { validateWebhookSignature, extractPullRequestData } = require('./webhookHandler');
const { fetchPullRequestDiff, fetchPullRequestFiles } = require('./diffFetcher');
const { cleanAndStructureDiff } = require('./diffCleaner');
const { generateStructuredPrompt } = require('./promptGenerator');
const { sendToLLM } = require('./llmClient');
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

// Store last generated prompt for viewing
let lastPrompt = null;

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
app.post('/github/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Extract required headers
    const eventType = req.headers['x-github-event'];
    const signature = req.headers['x-hub-signature-256'];
    const deliveryId = req.headers['x-github-delivery'];
    
    logger.info('📥 Webhook received', {
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
      
      logger.info('✨ Diff processing completed', {
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
    
    // Generate LLM prompt with cleaned diffs
    const promptFormat = process.env.PROMPT_FORMAT || 'full'; // 'full' or 'compact'
    const llmPrompt = generateStructuredPrompt(prData, cleanedDiff, promptFormat);
    
    if (!llmPrompt) {
      logger.warn('Failed to generate LLM prompt', {
        repository: prData.repository,
        pullRequestNumber: prData.pullRequestNumber
      });
    } else {
      // Log the generated prompt for visibility
      logger.info('📝 LLM Prompt Generated', {
        repository: prData.repository,
        pullRequestNumber: prData.pullRequestNumber,
        format: llmPrompt.format,
        estimatedTokens: llmPrompt.estimatedTokens,
        fileCount: llmPrompt.fileCount
      });
      
      // Output prompt to console (for debugging/viewing)
      if (process.env.LOG_PROMPT === 'true' || process.env.NODE_ENV === 'development') {
        console.log('\n' + '='.repeat(80));
        console.log('📝 GENERATED LLM PROMPT:');
        console.log('='.repeat(80));
        console.log(llmPrompt.prompt);
        console.log('='.repeat(80) + '\n');
      }
    }
    
    // Store prompt for /prompt/last endpoint
    if (llmPrompt) {
      lastPrompt = llmPrompt;
    }
    
    // Send prompt to Groq LLM (if configured)
    let llmResponse = null;
    const groqKey = process.env.GROQ_API_KEY;
    
    if (llmPrompt && groqKey) {
      try {
        llmResponse = await sendToLLM(llmPrompt.prompt, groqKey);
        
        logger.info('✅ LLM Analysis Complete', {
          repository: prData.repository,
          pullRequestNumber: prData.pullRequestNumber,
          provider: llmResponse.provider,
          model: llmResponse.model,
          tokensUsed: llmResponse.usage.totalTokens
        });
      } catch (error) {
        logger.error('Error calling LLM', {
          repository: prData.repository,
          pullRequestNumber: prData.pullRequestNumber,
          error: error.message
        });
        // Don't fail the webhook if LLM call fails
        llmResponse = {
          error: error.message,
          provider: 'groq'
        };
      }
    } else if (llmPrompt && !groqKey) {
      logger.warn('LLM prompt generated but GROQ_API_KEY not configured', {
        repository: prData.repository,
        pullRequestNumber: prData.pullRequestNumber
      });
    }
    
    // Week 2 Output Format (with LLM prompt and response)
    const week2Output = {
      repository: prData.repository,
      pullRequestNumber: prData.pullRequestNumber,
      cleanedDiff: cleanedDiff,
      llmPrompt: llmPrompt,
      llmResponse: llmResponse,
      preparedAt: new Date().toISOString()
    };
    
    // Log successful processing
    const processingTime = Date.now() - startTime;
    logger.info('✅ Pull request event processed successfully', {
      repository: prData.repository,
      pullRequestNumber: prData.pullRequestNumber,
      title: prData.title,
      author: prData.author,
      action: prData.action,
      deliveryId,
      processingTimeMs: processingTime,
      diffFiles: cleanedDiff.length,
      estimatedTokens: llmPrompt?.estimatedTokens || 0,
      receivedAt: prData.receivedAt
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
  console.log('\n' + '='.repeat(60));
  logger.info('🚀 GitGuard AI Webhook Listener started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    endpoint: `/github/webhook`
  });
  console.log('='.repeat(60) + '\n');
  
  if (!process.env.GITHUB_WEBHOOK_SECRET) {
    logger.warn('⚠️  WARNING: GITHUB_WEBHOOK_SECRET not set. Webhook validation will fail.');
  }
  
  if (!process.env.GITHUB_TOKEN) {
    logger.warn('⚠️  WARNING: GITHUB_TOKEN not set. Diff fetching will fail.');
  }
});

module.exports = app;

