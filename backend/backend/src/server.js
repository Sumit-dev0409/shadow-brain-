require('dotenv').config();
const app        = require('./app');
const connectDB  = require('./config/db');
const logger     = require('./utils/logger');
const enrichment = require('./services/enrichment.service');

const PORT = process.env.PORT || 8000;

// Last line of defense: an uncaught rejection anywhere (e.g. a transient
// MongoDB pool error surfacing from the driver's internal event handlers,
// outside any of our try/catch blocks) used to crash the whole process —
// silently taking down the API with no auto-restart. Log it instead.
process.on('unhandledRejection', (reason) => {
  logger.error(`[UNHANDLED REJECTION] ${reason instanceof Error ? reason.stack : reason}`);
});

const retryPendingSafely = () => {
  enrichment.retryPending().catch((err) => {
    logger.error(`[RETRY] retryPending() failed: ${err.message}`);
  });
};

connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

    // On startup: reset all FAILED → PENDING and enrich them
    setTimeout(retryPendingSafely, 3000);

    // Every 5 minutes: auto-retry any FAILED conversations
    setInterval(retryPendingSafely, 5 * 60 * 1000);
  });
});
