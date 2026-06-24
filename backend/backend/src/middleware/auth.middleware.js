const ApiKey = require('../models/api-key.model');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  const apiKey = req.header('X-API-KEY');

  if (!apiKey) {
    return res.status(401).json({ message: 'No API Key provided' });
  }

  // Check against static env key for extension or DB keys
  if (apiKey === process.env.BACKEND_API_KEY) {
    return next();
  }

  try {
    const keyRecord = await ApiKey.findOne({ key: apiKey, active: true });
    if (!keyRecord) {
      return res.status(401).json({ message: 'Invalid or inactive API Key' });
    }

    keyRecord.lastUsedAt = new Date();
    await keyRecord.save();
    next();
  } catch (error) {
    logger.error(`Auth middleware error: ${error.message}`);
    res.status(500).json({ message: 'Server auth error' });
  }
};

module.exports = authMiddleware;
