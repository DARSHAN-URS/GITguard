const express = require('express');
const {
  getRepositorySettings,
  updateRepositorySettings,
  getAllRepositorySettings,
  getReviewHistory,
  getReviewStatistics
} = require('./storage');
const Review = require('./models/Review');
const ReviewIssue = require('./models/ReviewIssue');
const logger = require('./logger');

const router = express.Router();

/**
 * GET /api/dashboard/settings
 * Get all repository settings
 */
router.get('/api/dashboard/settings', async (req, res) => {
  try {
    const settings = await getAllRepositorySettings();
    res.json({ success: true, settings });
  } catch (error) {
    logger.error('Error fetching dashboard settings', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

/**
 * GET /api/dashboard/settings/:repository
 */
router.get('/api/dashboard/settings/:repository', async (req, res) => {
  try {
    const repository = decodeURIComponent(req.params.repository);
    const settings = await getRepositorySettings(repository);
    res.json({ success: true, repository, settings });
  } catch (error) {
    logger.error('Error fetching repository settings', { repository: req.params.repository, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch repository settings' });
  }
});

/**
 * PUT /api/dashboard/settings/:repository
 */
router.put('/api/dashboard/settings/:repository', express.json(), async (req, res) => {
  try {
    const repository = decodeURIComponent(req.params.repository);
    const updates = req.body;

    const allowedKeys = ['strictMode', 'ignoreStyling', 'ignoreLinter', 'enabled'];
    const validUpdates = {};
    for (const key of allowedKeys) {
      if (updates.hasOwnProperty(key)) validUpdates[key] = Boolean(updates[key]);
    }

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid settings provided' });
    }

    const updatedSettings = await updateRepositorySettings(repository, validUpdates);
    res.json({ success: true, repository, settings: updatedSettings });
  } catch (error) {
    logger.error('Error updating repository settings', { repository: req.params.repository, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update repository settings' });
  }
});

/**
 * GET /api/dashboard/history
 */
router.get('/api/dashboard/history', async (req, res) => {
  try {
    const filters = {
      repository: req.query.repository || null,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    const history = await getReviewHistory(filters);
    res.json({ success: true, history, count: history.length, filters });
  } catch (error) {
    logger.error('Error fetching review history', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch review history' });
  }
});

/**
 * GET /api/dashboard/review/:id
 * Get structured review data including issues
 */
router.get('/api/dashboard/review/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id).lean();
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }

    const issues = await ReviewIssue.find({ reviewId: review._id }).lean();

    res.json({
      success: true,
      review: {
        ...review,
        issues
      }
    });
  } catch (error) {
    logger.error('Error fetching review details', { id: req.params.id, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch review details' });
  }
});

/**
 * GET /api/dashboard/statistics
 */
router.get('/api/dashboard/statistics', async (req, res) => {
  try {
    const repository = req.query.repository || null;
    const stats = await getReviewStatistics(repository);
    res.json({ success: true, statistics: stats });
  } catch (error) {
    logger.error('Error fetching statistics', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
