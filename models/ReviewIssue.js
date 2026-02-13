const mongoose = require('mongoose');

const reviewIssueSchema = new mongoose.Schema({
    reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true },
    repository: String,
    pullRequestNumber: Number,
    file: String,
    line: Number,
    type: { type: String, enum: ['Bug', 'Security', 'Performance', 'Quality', 'Best Practice'] },
    severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'] },
    title: String,
    message: String,
    suggestion: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReviewIssue', reviewIssueSchema);
