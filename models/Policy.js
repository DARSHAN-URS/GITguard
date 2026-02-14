const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    repositoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Repository', required: true, unique: true },
    blockRiskThreshold: { type: Number, default: 80 },
    blockOnHighSecurity: { type: Boolean, default: true },
    warnOnIssueCount: { type: Number, default: 5 },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Policy', policySchema);
