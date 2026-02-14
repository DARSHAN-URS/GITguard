const crypto = require('crypto');
const logger = require('./logger');

/**
 * Validates GitHub webhook signature using SHA-256 HMAC
 * @param {Buffer} rawBody - Raw request body
 * @param {string} signature - X-Hub-Signature-256 header value
 * @param {string} secret - Webhook secret from environment
 * @returns {boolean} - True if signature is valid
 */
function validateWebhookSignature(rawBody, signature, secret) {
  try {
    // GitHub sends signature as "sha256=<hash>"
    const expectedSignature = signature.replace('sha256=', '');

    // Calculate HMAC SHA-256
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest('hex');

    // Convert to buffers for comparison
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const calculatedBuffer = Buffer.from(calculatedSignature, 'hex');

    // Ensure buffers are same length (timingSafeEqual requires this)
    if (expectedBuffer.length !== calculatedBuffer.length) {
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
  } catch (error) {
    logger.error('Error validating signature', { error: error.message });
    return false;
  }
}

/**
 * Extracts and validates pull request data from GitHub webhook payload
 * Only processes 'opened' and 'reopened' actions
 * @param {Object} payload - GitHub webhook payload
 * @returns {Object|null} - Extracted PR data or null if invalid/ignored
 */
function extractPullRequestData(payload) {
  try {
    // Validate payload structure
    if (!payload || !payload.pull_request || !payload.repository) {
      logger.warn('Invalid payload structure', {
        hasPullRequest: !!payload?.pull_request,
        hasRepository: !!payload?.repository
      });
      return null;
    }

    const action = payload.action;
    const pr = payload.pull_request;
    const repo = payload.repository;

    // Only process 'opened' and 'reopened' actions
    const allowedActions = ['opened', 'reopened'];
    if (!allowedActions.includes(action)) {
      logger.info('Pull request action ignored', {
        action,
        reason: 'Only opened/reopened actions are processed'
      });
      return null;
    }

    // Extract required fields
    const prData = {
      repository: repo.full_name || repo.name || '',
      pullRequestNumber: pr.number || 0,
      title: pr.title || '',
      author: pr.user?.login || '',
      action: action,
      installationId: payload.installation?.id, // Added for GitHub App
      receivedAt: new Date().toISOString()
    };

    // Validate extracted data
    if (!prData.repository || !prData.pullRequestNumber || !prData.title || !prData.author) {
      logger.warn('Missing required PR fields', { prData });
      return null;
    }

    return prData;

  } catch (error) {
    logger.error('Error extracting PR data', {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

module.exports = {
  validateWebhookSignature,
  extractPullRequestData
};

