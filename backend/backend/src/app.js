const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const logger  = require('./utils/logger');
const { errorHandler } = require('./middleware/error.middleware');

const conversationRoutes = require('./routes/conversation.routes');
const importRoutes       = require('./routes/import.routes');
const chatRoutes         = require('./routes/chat.routes');
const healthRoutes       = require('./routes/health.routes');

const app = express();

// Allow Next.js frontend, localhost, and all Chrome extensions
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1')
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Log every incoming request so we can see if extension data arrives
app.use((req, res, next) => {
  if (req.method === 'POST') {
    console.log(`[REQUEST] ${req.method} ${req.path} from ${req.headers.origin || 'unknown'}`);
  }
  next();
});

// Routes
app.use('/api/conversations', conversationRoutes);  // authenticated CRUD
app.use('/api/import',        importRoutes);         // extension ingest — no auth
app.use('/api/chat',          chatRoutes);           // frontend chat — no auth
app.use('/api/health',        healthRoutes);

// Top-level health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use(errorHandler);

module.exports = app;
