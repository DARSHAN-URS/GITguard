const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class GitHubAppService {
    constructor() {
        this.appId = process.env.GITHUB_APP_ID;
        // Use GITHUB_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY as per requirements
        this.privateKey = (process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY)?.replace(/\\n/g, '\n');
        this.tokenCache = new Map(); // Simple in-memory cache for installation tokens
    }

    generateAppJwt() {
        logger.info({
            stage: "github_app_auth_start",
            appId: this.appId,
            hasPrivateKey: !!this.privateKey
        });

        const payload = {
            iat: Math.floor(Date.now() / 1000) - 60,
            exp: Math.floor(Date.now() / 1000) + (10 * 60),
            iss: this.appId,
        };

        try {
            const token = jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });

            logger.info({
                stage: "github_app_jwt_generated"
            });

            return token;
        } catch (error) {
            logger.error({
                stage: "github_app_auth_failed",
                message: "Failed to sign JWT",
                error: error.message
            });
            throw error;
        }
    }

    async getInstallationAccessToken(installationId) {
        // Check cache
        const cached = this.tokenCache.get(installationId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.token;
        }

        const appJwt = this.generateAppJwt();
        try {
            const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${appJwt}`,
                    'Accept': 'application/vnd.github+json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch installation token: ${response.statusText}`);
            }

            const data = await response.json();
            const expiresAt = new Date(data.expires_at).getTime() - (60 * 1000); // 1 min buffer

            this.tokenCache.set(installationId, {
                token: data.token,
                expiresAt: expiresAt
            });

            logger.info({
                stage: "installation_token_fetched",
                installationId
            });

            return data.token;
        } catch (error) {
            logger.error({
                stage: "github_app_auth_failed",
                installationId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new GitHubAppService();
