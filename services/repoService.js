const Repository = require('../models/Repository');

class RepoService {
    async findOrCreateRepo(fullName, installationId = null) {
        let repo = await Repository.findOne({ name: fullName });

        if (!repo) {
            repo = await Repository.create({
                name: fullName,
                installationId,
                settings: { enabled: true }
            });
        } else if (installationId && repo.installationId !== installationId) {
            // Update installationId if it changed or was missing
            repo.installationId = installationId;
            await repo.save();
        }

        return repo;
    }

    async getSettings(fullName) {
        const repo = await this.findOrCreateRepo(fullName);
        return repo.settings;
    }
}

module.exports = new RepoService();
