const Review = require('../models/Review');
const mongoose = require('mongoose');

class AnalyticsService {
    /**
     * Calculates monthly risk trends for a repository
     */
    async getRiskTrend(repositoryId) {
        const pipeline = [
            {
                $match: {
                    repositoryId: new mongoose.Types.ObjectId(repositoryId),
                    status: { $ne: 'failed' }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    avgRisk: { $avg: "$riskScore" },
                    prCount: { $sum: 1 },
                    blockedCount: { $sum: { $cond: ["$policyDecisionCache.isBlocked", 1, 0] } }
                }
            },
            { $sort: { "_id": 1 } },
            {
                $project: {
                    _id: 0,
                    month: "$_id",
                    avgRisk: { $round: ["$avgRisk", 2] },
                    prCount: 1,
                    blockedCount: 1
                }
            }
        ];

        return await Review.aggregate(pipeline);
    }

    /**
     * Get distribution of issues by category over time
     */
    async getIssueDistribution(repositoryId) {
        const pipeline = [
            { $match: { repositoryId: new mongoose.Types.ObjectId(repositoryId) } },
            {
                $lookup: {
                    from: 'reviewissues',
                    localField: '_id',
                    foreignField: 'reviewId',
                    as: 'issues'
                }
            },
            { $unwind: "$issues" },
            {
                $group: {
                    _id: "$issues.category",
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    category: "$_id",
                    count: 1
                }
            }
        ];

        return await Review.aggregate(pipeline);
    }
}

module.exports = new AnalyticsService();
