const jwt = require('jsonwebtoken');

function getJwtSecret() {
    return process.env.JWT_SECRET || 'the-defier-local-dev-secret';
}

function validateAuthConfig() {
    if (process.env.NODE_ENV !== 'production') return;
    const secret = process.env.JWT_SECRET || '';
    if (secret.trim().length < 32) {
        throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
    }
}

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '未提供认证Token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, getJwtSecret());
        req.user = decoded; // { id, username }
        req.authToken = token;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token无效或已过期' });
    }
};

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username },
        getJwtSecret(),
        { expiresIn: '30d' }
    );
};

module.exports = {
    authenticate,
    generateToken,
    get JWT_SECRET() {
        return getJwtSecret();
    },
    getJwtSecret,
    validateAuthConfig
};
