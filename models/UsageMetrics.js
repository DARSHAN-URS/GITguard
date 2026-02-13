const mongoose = require('mongoose');

const usageMetricsSchema = new mongoose.Schema({
    repository: String,
    totalTokens: { type: Number, default: 0 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    lastReviewAt: Date,
    month: { type: String, required: true }, // "YYYY-MM"
    createdAt: { type: Date, default: Date.now }
});

// Compound index for efficient lookups
usageMetricsSchema.index({ repository: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('UsageMetrics', usageMetricsSchema);
