const path = require('path');
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

const demoToken = generateDemoToken();

describe('Demo Authentication', () => {
  describe('generateDemoToken', () => {
    test('generates a token with correct claims', () => {
      const payload = jwt.verify(demoToken, DEMO_SECRET);
      expect(payload.sub).toBe(DEMO_USER.id);
      expect(payload.email).toBe(DEMO_USER.email);
      expect(payload.name).toBe(DEMO_USER.name);
      expect(payload.role).toBe(DEMO_USER.role);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    test('token contains all required fields', () => {
      const payload = jwt.verify(demoToken, DEMO_SECRET);
      expect(Object.keys(payload)).toContain('sub');
      expect(Object.keys(payload)).toContain('email');
      expect(Object.keys(payload)).toContain('name');
      expect(Object.keys(payload)).toContain('role');
      expect(Object.keys(payload)).toContain('iat');
      expect(Object.keys(payload)).toContain('exp');
    });
  });

  describe('demoAuthCheck', () => {
    test('accepts demo token in development mode via Authorization header', () => {
      process.env.NODE_ENV = 'development';
      const req = {
        header: function (name) {
          if (name === 'Authorization') return 'Bearer ' + demoToken;
          return null;
        },
      };
      expect(demoAuthCheck(req)).toBe(true);
      expect(req.user).toMatchObject({
        id: DEMO_USER.id,
        email: DEMO_USER.email,
        name: DEMO_USER.name,
        role: DEMO_USER.role,
      });
    });

    test('accepts demo token in development mode via Demo-Jwt header', () => {
      process.env.NODE_ENV = 'development';
      const req = {
        header: function (name) {
          if (name === 'Demo-Jwt') return demoToken;
          return null;
        },
      };
      expect(demoAuthCheck(req)).toBe(true);
      expect(req.user).toMatchObject({
        id: DEMO_USER.id,
        email: DEMO_USER.email,
        name: DEMO_USER.name,
        role: DEMO_USER.role,
      });
    });

    test('rejects demo token in production mode', () => {
      process.env.NODE_ENV = 'production';
      const req = {
        header: function (name) {
          if (name === 'Authorization') return 'Bearer ' + demoToken;
          return null;
        },
      };
      expect(demoAuthCheck(req)).toBe(false);
      expect(req.user).toBeUndefined();
    });

    test('rejects invalid token in development mode', () => {
      process.env.NODE_ENV = 'development';
      const req = {
        header: function (name) {
          if (name === 'Authorization') return 'Bearer invalid-token';
          return null;
        },
      };
      expect(demoAuthCheck(req)).toBe(false);
      expect(req.user).toBeUndefined();
    });

    test('rejects token with wrong demo credentials', () => {
      process.env.NODE_ENV = 'development';
      const wrongToken = jwt.sign(
        { sub: 'wrong-user', email: 'wrong@example.com', name: 'Wrong', role: 'user' },
        DEMO_SECRET
      );
      const req = {
        header: function (name) {
          if (name === 'Authorization') return 'Bearer ' + wrongToken;
          return null;
        },
      };
      expect(demoAuthCheck(req)).toBe(false);
      expect(req.user).toBeUndefined();
    });
  });
});