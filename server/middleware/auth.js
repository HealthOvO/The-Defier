const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'the-defier-local-dev-secret';

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '未提供认证Token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, username }
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token无效或已过期' });
    }
};

const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
};

module.exports = {
    authenticate,
    generateToken,
    JWT_SECRET
};
