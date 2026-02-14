const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true },
    prNumber: { type: Number, required: true },
    title: String,
    author: String,
    riskScore: { type: Number, default: 0, index: true },
    totalTokens: { type: Number, default: 0 },
    processingTimeMs: Number,
    status: { type: String, enum: ['clean', 'issues', 'partial', 'pending', 'failed'], default: 'pending' },
    policyDecisionCache: {
        isBlocked: { type: Boolean, default: false },
        blockingReason: String
    },
    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Review', reviewSchema);
