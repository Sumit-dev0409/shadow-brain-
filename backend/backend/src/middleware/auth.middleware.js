const jwt = require('jsonwebtoken');
const ApiKey = require('../models/api-key.model');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      if (!process.env.JWT_SECRET) {
        logger.error('[AUTH] JWT_SECRET environment variable is missing');
        return res.status(500).json({ message: 'Server configuration error' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    }

    const apiKey = req.header('X-API-KEY');
    if (apiKey) {
      if (apiKey === process.env.BACKEND_API_KEY) {
        return next();
      }

      const keyRecord = await ApiKey.findOne({ key: apiKey, active: true });
      if (keyRecord) {
        keyRecord.lastUsedAt = new Date();
        await keyRecord.save();
        return next();
      }

      return res.status(401).json({ message: 'Invalid or inactive API Key' });
    }

    return res.status(401).json({ message: 'Authentication required' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    logger.error(`[AUTH] Middleware error: ${error.message}`);
    return res.status(500).json({ message: 'Server auth error' });
  }
};

module.exports = authMiddleware;
