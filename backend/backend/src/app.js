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

// Allow Next.js frontend (localhost:3000) and extensions
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'chrome-extension://*'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Routes
app.use('/api/conversations', conversationRoutes);  // authenticated CRUD
app.use('/api/import',        importRoutes);         // extension ingest — no auth
app.use('/api/chat',          chatRoutes);           // frontend chat — no auth
app.use('/api/health',        healthRoutes);

// Top-level health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use(errorHandler);

module.exports = app;
