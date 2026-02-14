const mongoose = require('mongoose');

const reviewIssueSchema = new mongoose.Schema({
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true },
    file: String,
    category: { type: String, enum: ['bug', 'security', 'performance', 'quality'] },
    severity: { type: String, enum: ['low', 'medium', 'high'] },
    description: String,
    currentCode: String,
    suggestedFix: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReviewIssue', reviewIssueSchema);
