const express      = require('express');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const logger  = require('./utils/logger');
const { errorHandler } = require('./middleware/error.middleware');

const conversationRoutes = require('./routes/conversation.routes');
const importRoutes       = require('./routes/import.routes');
const chatRoutes         = require('./routes/chat.routes');
const healthRoutes       = require('./routes/health.routes');
const authRoutes         = require('./routes/auth.routes');

const app = express();

// Allow Next.js frontend, localhost, all Chrome extensions, and any deployed
// frontend origins listed in FRONTEND_URL (comma-separated, e.g. your Vercel URL)
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      allowedOrigins.includes(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// Log every incoming request so we can see if extension data arrives
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log(`\n[REQUEST] ═══════════════════════════════════════════════`);
    console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    console.log(`[REQUEST] Origin: ${req.headers.origin || 'none'}`);
    console.log(`[REQUEST] Content-Type: ${req.headers['content-type'] || 'none'}`);
    console.log(`[REQUEST] X-API-KEY: ${req.headers['x-api-key'] ? 'PRESENT (' + req.headers['x-api-key'].substring(0, 10) + '...)' : 'MISSING'}`);
    console.log(`[REQUEST] User-Agent: ${(req.headers['user-agent'] || '').substring(0, 80)}`);
    console.log(`[REQUEST] Body size: ${JSON.stringify(req.body || {}).length} bytes`);
    console.log(`[REQUEST] Body keys: ${req.body ? Object.keys(req.body).join(', ') : 'EMPTY'}`);
    if (req.body?.platform) console.log(`[REQUEST] Platform: ${req.body.platform}`);
    if (req.body?.title) console.log(`[REQUEST] Title: ${(req.body.title || '').substring(0, 60)}`);
    if (req.body?.messages) console.log(`[REQUEST] Message count: ${(req.body.messages || []).length}`);
    if (req.body?.conversations) console.log(`[REQUEST] Bulk count: ${(req.body.conversations || []).length}`);
    console.log(`[REQUEST] ═══════════════════════════════════════════════`);
  }
  next();
});

// Routes
app.use('/api/conversations', conversationRoutes);  // authenticated CRUD
app.use('/api/import',        importRoutes);         // extension ingest — no auth
app.use('/api/chat',          chatRoutes);           // frontend chat — no auth
app.use('/api/health',        healthRoutes);
app.use('/api/auth',          authRoutes);           // Google sign-in

// Top-level health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use(errorHandler);

module.exports = app;
