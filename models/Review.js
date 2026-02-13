const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    repository: { type: String, required: true },
    pullRequestNumber: { type: Number, required: true },
    title: String,
    author: String,
    summary: String,
    riskScore: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    usage: {
        promptTokens: Number,
        completionTokens: Number,
        totalTokens: Number
    },
    processingTimeMs: Number,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
