const ApiKey = require('../models/api-key.model');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  const apiKey = req.header('X-API-KEY');

  console.log(`[AUTH] Request to ${req.method} ${req.originalUrl}`);
  console.log(`[AUTH] X-API-KEY header: ${apiKey ? 'PRESENT (starts with: ' + apiKey.substring(0, 8) + '...)' : 'MISSING'}`);
  console.log(`[AUTH] BACKEND_API_KEY env: ${process.env.BACKEND_API_KEY ? 'PRESENT (starts with: ' + process.env.BACKEND_API_KEY.substring(0, 8) + '...)' : 'MISSING'}`);

  if (!apiKey) {
    console.warn(`[AUTH] No API key provided — returning 401`);
    return res.status(401).json({ message: 'No API Key provided' });
  }

  // Check against static env key for extension or DB keys
  if (apiKey === process.env.BACKEND_API_KEY) {
    console.log(`[AUTH] API key matches BACKEND_API_KEY — allowed`);
    return next();
  }

  console.warn(`[AUTH] API key does NOT match BACKEND_API_KEY — checking database`);

  try {
    const keyRecord = await ApiKey.findOne({ key: apiKey, active: true });
    if (!keyRecord) {
      console.warn(`[AUTH] No matching active API key in DB — returning 401`);
      return res.status(401).json({ message: 'Invalid or inactive API Key' });
    }

    console.log(`[AUTH] Found matching API key in DB — allowing`);
    keyRecord.lastUsedAt = new Date();
    await keyRecord.save();
    next();
  } catch (error) {
    console.error(`[AUTH] Auth middleware error: ${error.message}`);
    console.error(`[AUTH] Error stack: ${error.stack}`);
    res.status(500).json({ message: 'Server auth error' });
  }
};

module.exports = authMiddleware;
