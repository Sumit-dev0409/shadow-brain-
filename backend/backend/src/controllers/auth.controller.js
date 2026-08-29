const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const {
  DEMO_USER,
  generateDemoToken,
  demoAuthCheck,
} = require('../middleware/demo-auth.middleware');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.error('[Auth] ⚠️  GOOGLE_CLIENT_ID is not set — Google login will fail');
}
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const SESSION_COOKIE = 'shadowbrain_token';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const isProd = process.env.NODE_ENV === 'production';
// Cross-site (frontend and backend on different domains) requires SameSite=None + Secure (HTTPS-only).
// Locally, frontend/backend are same-site (both localhost) so Lax works over plain HTTP.
const cookieOptions = {
  httpOnly: true,
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
};

function signSession(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

const googleLogin = async (req, res, next) => {
  try {
    if (!googleClient) {
      console.error('[Auth] Google login attempted but GOOGLE_CLIENT_ID is not configured');
      return res.status(503).json({ message: 'Google sign-in is not configured on this server' });
    }

    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(401).json({ message: 'Google token did not include an email' });
    }

    const user = await User.findOneAndUpdate(
      { googleId: payload.sub },
      {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatar: payload.picture,
        lastLoginAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const token = signSession(user);
    console.log(`[AUTH-DEBUG] Step 1 — JWT generated for ${user.email}, length=${token.length}, preview=${token.slice(0,30)}...`);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: COOKIE_MAX_AGE_MS });

    res.json({
      token,
      user: {
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error(`[Auth] Google login error: ${error.message}`);
    console.error(`[Auth] Stack: ${error.stack}`);
    if (error.message.includes('Wrong number of segments')) {
      console.error('[Auth] Token format invalid — credential may be corrupt or truncated');
    }
    if (error.message.includes('Token used too early') || error.message.includes('Token used too late')) {
      console.error('[Auth] Token clock skew issue — check server time sync');
    }
    logger.error(`[Auth] Google login failed: ${error.message}`);
    res.status(401).json({ message: 'Google sign-in failed' });
  }
};

const me = async (req, res) => {
  const demoAuthResult = demoAuthCheck(req);
  if (demoAuthResult) {
    return res.json({
      email: demoAuthResult.user.email,
      name: demoAuthResult.user.name,
      avatar: undefined,
    });
  }

  const token = req.cookies?.[SESSION_COOKIE] || req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Not signed in' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.sub);
    if (!user) return res.status(401).json({ message: 'Not signed in' });
    res.json({ token, email: user.email, name: user.name, avatar: user.avatar });
  } catch {
    res.status(401).json({ message: 'Not signed in' });
  }
};

const logout = (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ ok: true });
};

module.exports = { googleLogin, me, logout };
