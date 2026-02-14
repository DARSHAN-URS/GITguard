const UsageMetric = require('../models/UsageMetric');
const logger = require('../utils/logger');

class UsageService {
    async trackUsage(repositoryId, tokensUsed) {
        try {
            const month = new Date().toISOString().substring(0, 7); // YYYY-MM

            await UsageMetric.findOneAndUpdate(
                { repositoryId, month },
                {
                    $inc: {
                        totalTokensUsed: tokensUsed,
                        totalReviews: 1
                    },
                    $set: { updatedAt: new Date() }
                },
                { upsert: true, new: true }
            );

            logger.info('Usage metrics updated', { repositoryId, month, tokensUsed });
        } catch (error) {
            logger.error('Failed to update usage metrics', { error: error.message });
        }
    }
}

module.exports = new UsageService();
