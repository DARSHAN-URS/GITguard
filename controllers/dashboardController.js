const express = require('express');
const Review = require('../models/Review');
const ReviewIssue = require('../models/ReviewIssue');
const Repository = require('../models/Repository');
const Policy = require('../models/Policy');
const analyticsService = require('../services/analyticsService');
const authenticate = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication to all API routes
router.use(authenticate);

/**
 * DASHBOARD & SETTINGS
 */
router.get('/dashboard/settings', authorize(['viewer', 'developer', 'admin']), async (req, res) => {
    try {
        const settings = await Repository.find({});
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('Error fetching settings', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
});

router.put('/dashboard/settings/:id', authorize(['admin']), async (req, res) => {
    try {
        const repo = await Repository.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, repo });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * ANALYTICS (Elite Requirement)
 * GET /api/analytics/risk-trend?repoId=...
 */
router.get('/analytics/risk-trend', authorize(['viewer', 'developer', 'admin']), async (req, res) => {
    try {
        const { repoId } = req.query;
        if (!repoId) return res.status(400).json({ error: 'repoId is required' });

        const trend = await analyticsService.getRiskTrend(repoId);
        const distribution = await analyticsService.getIssueDistribution(repoId);

        res.json({ success: true, monthly: trend, distribution });
    } catch (error) {
        logger.error('Analytics Error', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * POLICY ENGINE (Enterprise Requirement)
 */
router.get('/policies/:repoId', authorize(['developer', 'admin']), async (req, res) => {
    try {
        let policy = await Policy.findOne({ repositoryId: req.params.repoId });
        if (!policy) {
            policy = await Policy.create({ repositoryId: req.params.repoId });
        }
        res.json({ success: true, policy });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/policies/:repoId', authorize(['admin']), async (req, res) => {
    try {
        const policy = await Policy.findOneAndUpdate(
            { repositoryId: req.params.repoId },
            req.body,
            { new: true, upsert: true }
        );
        res.json({ success: true, policy });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
