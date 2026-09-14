const path = require('path');
const jwt = require('jsonwebtoken');

const DEMO_SECRET = 'demo-only-secret-change-me';

const DEMO_USER = {
  id: 'demo-test-user',
  email: 'demo@example.com',
  name: 'Demo Test User',
  role: 'tester',
};

function verifyDemoToken(token) {
  try {
    const decoded = jwt.verify(token, DEMO_SECRET);
    console.log('decoded:', decoded);
    console.log('sub match:', decoded.sub === DEMO_USER.id);
    console.log('email match:', decoded.email === DEMO_USER.email);
    console.log('name match:', decoded.name === DEMO_USER.name);
    console.log('role match:', decoded.role === DEMO_USER.role);
    const match =
      decoded.sub === DEMO_USER.id &&
      decoded.email === DEMO_USER.email &&
      decoded.name === DEMO_USER.name &&
      decoded.role === DEMO_USER.role;
    console.log('overall match:', match);
    if (match) {
      this.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
      };
      console.log('this.user set:', this.user);
    }
    return match;
  } catch (e) {
    console.log('error:', e.message);
    return false;
  }
}

function demoAuthCheck(req) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  console.log('isDevelopment:', isDevelopment, 'NODE_ENV:', process.env.NODE_ENV);
  if (!isDevelopment) return false;

  const authHeader = req.header('Authorization');
  console.log('authHeader:', authHeader);
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    console.log('token:', token);
    if (verifyDemoToken.call(req, token)) return true;
  }
  return false;
}

const demoToken = jwt.sign(
  { sub: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, role: DEMO_USER.role },
  DEMO_SECRET,
  { expiresIn: '24h' }
);

process.env.NODE_ENV = 'development';

const req = {
  header: function (name) {
    if (name === 'Authorization') return 'Bearer ' + demoToken;
    return null;
  },
};

const result = demoAuthCheck(req);
console.log('result:', result);
console.log('req.user:', req.user);