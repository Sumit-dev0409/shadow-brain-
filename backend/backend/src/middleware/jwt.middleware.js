const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');

const jwtMiddleware = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  console.log(`[JWT-STEP-7] ═══ jwtMiddleware: ${req.method} ${req.originalUrl} ═══`);
  console.log(`[JWT-STEP-7]   Authorization header: ${authHeader ? 'PRESENT' : 'MISSING'}`);
  console.log(`[JWT-STEP-7]   Authorization raw: ${authHeader ? authHeader.slice(0, 60) + '...' : 'N/A'}`);
  console.log(`[JWT-STEP-7]   Origin: ${req.header('Origin') || 'none'}`);
  console.log(`[JWT-STEP-7]   Content-Type: ${req.header('Content-Type') || 'none'}`);

  if (!authHeader) {
    console.error(`[JWT-STEP-7] ❌ FAIL — No Authorization header`);
    console.error(`[JWT-STEP-7]   The request reached the backend WITHOUT the Bearer token`);
    console.error(`[JWT-STEP-7]   This means the extension either:`);
    console.error(`[JWT-STEP-7]     a) Never received the JWT from the web app, OR`);
    console.error(`[JWT-STEP-7]     b) chrome.storage.local had no JWT at fetch time, OR`);
    console.error(`[JWT-STEP-7]     c) A different code path (startup sync) fired with an empty token`);
    return res.status(401).json({ message: 'Authorization header is missing' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.error(`[JWT-STEP-7] ❌ FAIL — Bad format: "${authHeader.slice(0, 30)}"`);
    return res.status(401).json({ message: 'Authorization format must be Bearer <token>' });
  }

  const token = parts[1];
  console.log(`[JWT-STEP-7]   Token length: ${token.length}`);
  console.log(`[JWT-STEP-7]   Token preview: ${token.slice(0, 40)}...`);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`[JWT-STEP-7] ✅ PASS — JWT verified`);
    console.log(`[JWT-STEP-7]   decoded.userId: ${decoded.userId}`);
    console.log(`[JWT-STEP-7]   decoded.email: ${decoded.email}`);
    console.log(`[JWT-STEP-7]   decoded.iat: ${decoded.iat}`);
    console.log(`[JWT-STEP-7]   decoded.exp: ${decoded.exp}`);
    console.log(`[JWT-STEP-7]   Full decoded: ${JSON.stringify(decoded)}`);

    if (!decoded.userId) {
      console.error(`[JWT-STEP-7] ❌ FAIL — No userId in token payload`);
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    // Verify user exists in database
    const userExists = await User.exists({ _id: decoded.userId });
    if (!userExists) {
      console.error(`[JWT-STEP-7] ❌ FAIL — userId ${decoded.userId} not found in DB`);
      return res.status(401).json({ message: 'User not found' });
    }

    console.log(`[JWT-STEP-7] ✅ PASS — User exists in DB`);
    console.log(`[JWT-STEP-7]   req.user = { userId: "${decoded.userId}", email: "${decoded.email}" }`);
    req.user = decoded;
    next();
  } catch (error) {
    console.error(`[JWT-STEP-7] ❌ FAIL — JWT verification error: ${error.name}: ${error.message}`);
    if (error.name === 'TokenExpiredError') {
      console.error(`[JWT-STEP-7]   Token expired at ${error.expiredAt}`);
      return res.status(401).json({ message: 'Token has expired' });
    }
    return res.status(401).json({ message: 'Invalid or malformed token' });
  }
};

module.exports = jwtMiddleware;
