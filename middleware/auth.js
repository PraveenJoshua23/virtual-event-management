const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/config');
const { logEvent } = require('../config/logger');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        logEvent('warn', 'Authentication failed - No token provided', {
            action: 'AUTH_ERROR'
        });
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            logEvent('warn', 'Authentication failed - Invalid token', {
                action: 'AUTH_ERROR',
                error: err.message
            });
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        // Log successful authentication
        logEvent('info', 'User authenticated successfully', {
            userId: user.id,
            action: 'AUTH_SUCCESS'
        });

        req.user = user;
        next();
    });
};

module.exports = { authenticateToken };