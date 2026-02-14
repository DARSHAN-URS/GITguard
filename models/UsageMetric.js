const mongoose = require('mongoose');

const usageMetricSchema = new mongoose.Schema({
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
    month: { type: String, required: true }, // YYYY-MM
    totalTokensUsed: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

usageMetricSchema.index({ repositoryId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('UsageMetric', usageMetricSchema);
