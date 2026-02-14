const Repository = require('./models/Repository');
const Review = require('./models/Review');
const ReviewIssue = require('./models/ReviewIssue');
const UsageMetrics = require('./models/UsageMetrics');
const logger = require('./logger');

/**
 * Normalize repository name
 */
function normalizeRepository(repository) {
  if (!repository) return '';
  return repository.trim().toLowerCase();
}

/**
 * Get repository settings
 */
async function getRepositorySettings(repository) {
  try {
    const normalizedRepo = normalizeRepository(repository);
    let repo = await Repository.findOne({ name: normalizedRepo });

    if (!repo) {
      repo = await Repository.create({
        name: normalizedRepo,
        settings: {
          strictMode: false,
          ignoreStyling: false,
          ignoreLinter: false,
          enabled: true
        }
      });
    }

    return repo.settings;
  } catch (error) {
    logger.error('Error getting repository settings', { error: error.message });
    return {
      strictMode: false,
      ignoreStyling: false,
      ignoreLinter: false,
      enabled: true
    };
  }
}

/**
 * Update repository settings
 */
async function updateRepositorySettings(repository, updates) {
  try {
    const normalizedRepo = normalizeRepository(repository);
    const repo = await Repository.findOneAndUpdate(
      { name: normalizedRepo },
      {
        $set: {
          'settings.strictMode': updates.strictMode,
          'settings.ignoreStyling': updates.ignoreStyling,
          'settings.ignoreLinter': updates.ignoreLinter,
          'settings.enabled': updates.enabled
        }
      },
      { new: true, upsert: true }
    );

    logger.info('Repository settings updated', { repository: normalizedRepo, updates });
    return repo.settings;
  } catch (error) {
    logger.error('Error updating repository settings', { repository, error: error.message });
    throw error;
  }
}

/**
 * Get all repository settings
 */
async function getAllRepositorySettings() {
  try {
    const repos = await Repository.find({});
    const settingsMap = {};
    repos.forEach(repo => {
      settingsMap[repo.name] = repo.settings;
    });
    return settingsMap;
  } catch (error) {
    logger.error('Error reading all repository settings', { error: error.message });
    return {};
  }
}

/**
 * Save review history entry
 */
async function saveReviewHistory(reviewData) {
  try {
    const { repository, pullRequestNumber, title, author, llmResponse } = reviewData;

    // Create the main review document
    const review = await Review.create({
      repository: normalizeRepository(repository),
      pullRequestNumber,
      title,
      author,
      summary: llmResponse.summary || '',
      riskScore: llmResponse.risk_score || 0,
      status: 'completed',
      usage: llmResponse.usage,
      processingTimeMs: llmResponse.processingTimeMs
    });

    // Store issues as separate documents if they exist
    if (llmResponse.issues && Array.isArray(llmResponse.issues)) {
      const issueDocs = llmResponse.issues.map(issue => ({
        reviewId: review._id,
        repository: normalizeRepository(repository),
        pullRequestNumber,
        file: issue.file || 'unknown',
        line: issue.line,
        type: issue.type || 'Quality',
        severity: issue.severity || 'Medium',
        title: issue.title || 'Review Issue',
        message: issue.message || '',
        suggestion: issue.suggestion || ''
      }));

      await ReviewIssue.insertMany(issueDocs);
    }

    // Update usage metrics
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    await UsageMetrics.findOneAndUpdate(
      { repository: normalizeRepository(repository), month: currentMonth },
      {
        $inc: {
          totalTokens: llmResponse.usage.totalTokens || 0,
          promptTokens: llmResponse.usage.promptTokens || 0,
          completionTokens: llmResponse.usage.completionTokens || 0,
          reviewCount: 1
        },
        $set: { lastReviewAt: new Date() }
      },
      { upsert: true }
    );

    logger.info('Review history and metrics saved to MongoDB', {
      repository,
      pullRequestNumber,
      reviewId: review._id
    });

    return review;
  } catch (error) {
    logger.error('Error saving review history or metrics to MongoDB', {
      error: error.message,
      repository: reviewData.repository
    });
  }
}

/**
 * Get review history
 */
async function getReviewHistory(filters = {}) {
  try {
    const query = {};
    if (filters.repository) {
      query.repository = normalizeRepository(filters.repository);
    }

    const offset = filters.offset || 0;
    const limit = filters.limit || 50;

    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    // For each review, we might want to attach issues if requested
    // But for the basic history list, summary and risk score might be enough
    return reviews;
  } catch (error) {
    logger.error('Error reading review history', { error: error.message });
    return [];
  }
}

/**
 * Get review statistics
 */
async function getReviewStatistics(repository = null) {
  try {
    const query = {};
    if (repository) {
      query.repository = normalizeRepository(repository);
    }

    const totalReviews = await Review.countDocuments(query);

    // Use aggregation to count issues by type
    const issueStats = await ReviewIssue.aggregate([
      { $match: repository ? { repository: normalizeRepository(repository) } : {} },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const byType = {
      Bug: 0,
      Security: 0,
      Performance: 0,
      Quality: 0
    };

    issueStats.forEach(stat => {
      if (byType[stat._id] !== undefined) {
        byType[stat._id] = stat.count;
      }
    });

    const repoCount = repository ? 1 : (await Repository.countDocuments({}));

    return {
      totalReviews,
      issuesByType: byType,
      repositories: repoCount
    };
  } catch (error) {
    logger.error('Error calculating review statistics', { error: error.message });
    return {
      totalReviews: 0,
      issuesByType: { Bug: 0, Security: 0, Performance: 0, Quality: 0 },
      repositories: 0
    };
  }
}

/**
 * Legacy support for initialization - now just ensures connection
 */
async function initializeStorage() {
  // Connection is handled by db.js
  return Promise.resolve();
}

module.exports = {
  initializeStorage,
  getRepositorySettings,
  updateRepositorySettings,
  getAllRepositorySettings,
  saveReviewHistory,
  getReviewHistory,
  getReviewStatistics
};
