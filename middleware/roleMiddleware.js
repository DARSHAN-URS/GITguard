const logger = require('../utils/logger');

/**
 * Enforces Role-Based Access Control (RBAC)
 * @param {Array<string>} allowedRoles - Roles permitted to access the route
 */
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        // In a real app, req.user would be populated by an authMiddleware (e.g. JWT)
        // For this refactor, we'll assume req.user is populated.
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: No user session found' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn(`Access denied for user ${req.user.username}`, {
                role: req.user.role,
                required: allowedRoles,
                path: req.path
            });
            return res.status(403).json({
                error: 'Forbidden: You do not have permission to perform this action'
            });
        }

        next();
    };
};

module.exports = authorize;
