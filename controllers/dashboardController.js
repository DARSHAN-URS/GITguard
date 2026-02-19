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
        const repos = await Repository.find({});
        // Transform array to object mapping name -> settings for frontend
        const settings = {};
        repos.forEach(repo => {
            settings[repo.name] = repo.settings || {};
        });
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('Error fetching settings', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
});

router.put('/dashboard/settings/:name', authorize(['admin']), async (req, res) => {
    try {
        const repoName = decodeURIComponent(req.params.name);
        const updateData = {};
        // Map top-level keys from UI to the 'settings' sub-object in DB
        Object.keys(req.body).forEach(key => {
            updateData[`settings.${key}`] = req.body[key];
        });

        const repo = await Repository.findOneAndUpdate(
            { name: repoName },
            { $set: updateData },
            { new: true }
        );

        if (!repo) {
            return res.status(404).json({ success: false, error: 'Repository not found' });
        }
        res.json({ success: true, repo });
    } catch (error) {
        logger.error('Update setting error', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * REVIEW HISTORY
 */
router.get('/dashboard/history', authorize(['viewer', 'developer', 'admin']), async (req, res) => {
    try {
        const { repository } = req.query;
        let query = {};

        if (repository) {
            const repoDoc = await Repository.findOne({ name: repository });
            if (repoDoc) {
                query.repositoryId = repoDoc._id;
            } else {
                return res.json({ success: true, history: [] });
            }
        }

        const reviews = await Review.find(query)
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('repositoryId', 'name');

        // Transform for UI
        const history = reviews.map(r => ({
            _id: r._id,
            repository: r.repositoryId?.name || 'Unknown',
            pullRequestNumber: r.prNumber,
            title: r.title,
            author: r.author,
            createdAt: r.createdAt,
            status: r.status,
            riskScore: r.riskScore,
            reviewBody: r.policyDecisionCache?.blockingReason || 'Review processed successfully.'
        }));

        res.json({ success: true, history });
    } catch (error) {
        logger.error('History fetch error', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to fetch history' });
    }
});

/**
 * DASHBOARD STATISTICS
 */
router.get('/dashboard/statistics', authorize(['viewer', 'developer', 'admin']), async (req, res) => {
    try {
        const { repository } = req.query;
        let query = {};
        let repoId = null;

        if (repository) {
            const repoDoc = await Repository.findOne({ name: repository });
            if (repoDoc) {
                repoId = repoDoc._id;
                query.repositoryId = repoId;
            }
        }

        const totalReviews = await Review.countDocuments(query);
        const uniqueRepos = repository ? 1 : await Repository.countDocuments({});

        // Get issue counts by category
        const issueMatch = repoId ? { 'review.repositoryId': repoId } : {};
        const issueStats = await ReviewIssue.aggregate([
            {
                $lookup: {
                    from: 'reviews',
                    localField: 'reviewId',
                    foreignField: '_id',
                    as: 'review'
                }
            },
            { $unwind: '$review' },
            { $match: issueMatch },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        const issuesByType = {
            Bug: 0,
            Security: 0,
            Performance: 0,
            Quality: 0
        };

        issueStats.forEach(stat => {
            const category = stat._id.charAt(0).toUpperCase() + stat._id.slice(1);
            if (issuesByType.hasOwnProperty(category)) {
                issuesByType[category] = stat.count;
            }
        });

        res.json({
            success: true,
            statistics: {
                totalReviews,
                repositories: uniqueRepos,
                issuesByType
            }
        });
    } catch (error) {
        logger.error('Statistics error', { error: error.message });
        res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
    }
});

/**
 * ANALYTICS (Elite Requirement)
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

