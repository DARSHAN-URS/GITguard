const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // "owner/repo"
    githubId: Number,
    owner: String,
    settings: {
        strictMode: { type: Boolean, default: false },
        ignoreStyling: { type: Boolean, default: false },
        ignoreLinter: { type: Boolean, default: false },
        enabled: { type: Boolean, default: true }
    },
    lastProcessedAt: Date,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Repository', repositorySchema);
