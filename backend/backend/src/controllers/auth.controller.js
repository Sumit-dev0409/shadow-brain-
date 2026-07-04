const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
    { sub: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

const googleLogin = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
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
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: COOKIE_MAX_AGE_MS });

    res.json({
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    });
  } catch (error) {
    logger.error(`[Auth] Google login failed: ${error.message}`);
    res.status(401).json({ message: 'Google sign-in failed' });
  }
};

const me = async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ message: 'Not signed in' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.sub);
    if (!user) return res.status(401).json({ message: 'Not signed in' });
    res.json({ email: user.email, name: user.name, avatar: user.avatar });
  } catch {
    res.status(401).json({ message: 'Not signed in' });
  }
};

const logout = (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ ok: true });
};

module.exports = { googleLogin, me, logout };
