const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Authentication Middleware
 * In enterprise grade, this would verify a JWT from an OIDC provider or GitHub OAuth.
 * For this refactor, we extract identifying info to populate req.user.
 */
const authenticate = async (req, res, next) => {
    // Development Admin Override
    if (process.env.NODE_ENV !== 'production') {
        console.log('[DEV MODE] Admin override enabled');
        req.user = {
            id: 'local-admin',
            email: 'admin@local.dev',
            role: 'admin'
        };
        return next();
    }

    try {
        // Mocking auth for the purpose of the refactor.
        // In production, this would use passport.js or jose/jsonwebtoken to verify session.
        const mockRole = req.headers['x-user-role'] || 'viewer';
        const mockUsername = req.headers['x-user-name'] || 'guest_user';

        // Try to find user or use a mock object
        req.user = {
            username: mockUsername,
            role: mockRole,
            githubId: 'mock-123'
        };

        next();
    } catch (error) {
        logger.error('Authentication Error', { error: error.message });
        res.status(401).json({ error: 'Authentication failed' });
    }
};

module.exports = authenticate;
