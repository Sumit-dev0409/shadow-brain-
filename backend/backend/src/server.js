require('dotenv').config();
const app        = require('./app');
const connectDB  = require('./config/db');
const logger     = require('./utils/logger');
const enrichment = require('./services/enrichment.service');

const PORT = process.env.PORT || 8000;

// ── DEBUG: Print all environment variables (mask secrets) ────────
console.log(`\n[SERVER] ═══════════════════════════════════════════════`);
console.log(`[SERVER] Brain Shadow Backend — Starting up`);
console.log(`[SERVER] Timestamp: ${new Date().toISOString()}`);
console.log(`[SERVER] Node.js version: ${process.version}`);
console.log(`[SERVER] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[SERVER] PORT: ${PORT}`);
console.log(`[SERVER] MONGODB_URI present: ${!!process.env.MONGODB_URI}`);
console.log(`[SERVER] MONGODB_URI length: ${(process.env.MONGODB_URI || '').length}`);
if (process.env.MONGODB_URI) {
  const masked = process.env.MONGODB_URI.replace(/:([^@]+)@/, ':****@');
  console.log(`[SERVER] MONGODB_URI (masked): ${masked}`);
}
console.log(`[SERVER] GROQ_API_KEY present: ${!!process.env.GROQ_API_KEY}`);
console.log(`[SERVER] CEREBRAS_API_KEY present: ${!!process.env.CEREBRAS_API_KEY}`);
console.log(`[SERVER] BACKEND_API_KEY present: ${!!process.env.BACKEND_API_KEY}`);
console.log(`[SERVER] ═══════════════════════════════════════════════\n`);

// Last line of defense: an uncaught rejection anywhere (e.g. a transient
// MongoDB pool error surfacing from the driver's internal event handlers,
// outside any of our try/catch blocks) used to crash the whole process —
// silently taking down the API with no auto-restart. Log it instead.
process.on('unhandledRejection', (reason) => {
  console.error(`[UNHANDLED REJECTION] ${reason instanceof Error ? reason.stack : reason}`);
  logger.error(`[UNHANDLED REJECTION] ${reason instanceof Error ? reason.stack : reason}`);
});

process.on('uncaughtException', (err) => {
  console.error(`[UNCAUGHT EXCEPTION] ${err.stack}`);
  logger.error(`[UNCAUGHT EXCEPTION] ${err.stack}`);
});

const retryPendingSafely = () => {
  enrichment.retryPending().catch((err) => {
    console.error(`[RETRY] retryPending() failed: ${err.message}`);
    logger.error(`[RETRY] retryPending() failed: ${err.message}`);
  });
};

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n[SERVER] ═══════════════════════════════════════════════`);
    console.log(`[SERVER] Server listening on port ${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV}`);
    console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
    console.log(`[SERVER] Import endpoint: http://localhost:${PORT}/api/import/capture`);
    console.log(`[SERVER] Conversations endpoint: http://localhost:${PORT}/api/conversations`);
    console.log(`[SERVER] ═══════════════════════════════════════════════\n`);
    logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

    // On startup: reset all FAILED → PENDING and enrich them
    setTimeout(retryPendingSafely, 3000);

    // Every 5 minutes: auto-retry any FAILED conversations
    setInterval(retryPendingSafely, 5 * 60 * 1000);
  });
});
