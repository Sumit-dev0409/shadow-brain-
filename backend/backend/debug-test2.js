process.env.NODE_ENV = 'development';
const jwt = require('jsonwebtoken');
const DEMO_SECRET = 'demo-only-secret-change-me';
const DEMO_USER = { id: 'demo-test-user', email: 'demo@example.com', name: 'Demo Test User', role: 'tester' };

function verifyDemoToken(token) {
  try {
    const decoded = jwt.verify(token, DEMO_SECRET);
    const match =
      decoded.sub === DEMO_USER.id &&
      decoded.email === DEMO_USER.email &&
      decoded.name === DEMO_USER.name &&
      decoded.role === DEMO_USER.role;
    if (match) {
      this.user = { id: decoded.sub, email: decoded.email, name: decoded.name, role: decoded.role };
    }
    return match;
  } catch {
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

function generateDemoToken() {
  return jwt.sign({ sub: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, role: DEMO_USER.role }, DEMO_SECRET, { expiresIn: '24h' });
}

const demoToken = generateDemoToken();

const req = {
  header: function(name) {
    if (name === 'Authorization') return 'Bearer ' + demoToken;
    return null;
  },
};

const result = demoAuthCheck(req);
console.log('result:', result);
console.log('req.user:', req.user);