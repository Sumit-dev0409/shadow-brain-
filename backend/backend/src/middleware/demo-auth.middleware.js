const jwt = require('jsonwebtoken');

const DEMO_SECRET = 'demo-only-secret-change-me';

const DEMO_USER = {
  id: 'demo-test-user',
  email: 'demo@example.com',
  name: 'Demo Test User',
  role: 'tester',
};

function verifyDemoToken(token, req) {
  try {
    const decoded = jwt.verify(token, DEMO_SECRET);
    const match =
      decoded.sub === DEMO_USER.id &&
      decoded.email === DEMO_USER.email &&
      decoded.name === DEMO_USER.name &&
      decoded.role === DEMO_USER.role;
    if (match) {
      return { success: true, user: { id: decoded.sub, email: decoded.email, name: decoded.name, role: decoded.role } };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

function generateDemoToken() {
  return jwt.sign(
    {
      sub: DEMO_USER.id,
      email: DEMO_USER.email,
      name: DEMO_USER.name,
      role: DEMO_USER.role,
    },
    DEMO_SECRET,
    { expiresIn: '24h' }
  );
}

function demoAuthCheck(req) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (!isDevelopment) return false;

  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = verifyDemoToken(token, req);
    if (result.success) {
      req.user = result.user;
      return true;
    }
  }

  const demoJwtHeader = req.header('Demo-Jwt');
  if (demoJwtHeader) {
    const result = verifyDemoToken(demoJwtHeader, req);
    if (result.success) {
      req.user = result.user;
      return true;
    }
  }

  return false;
}

module.exports = {
  DEMO_USER,
  generateDemoToken,
  demoAuthCheck,
};