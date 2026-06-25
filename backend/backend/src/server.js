require('dotenv').config();
const app        = require('./app');
const connectDB  = require('./config/db');
const logger     = require('./utils/logger');
const enrichment = require('./services/enrichment.service');

const PORT = process.env.PORT || 8000;

connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

    // On startup: reset all FAILED → PENDING and enrich them
    setTimeout(() => enrichment.retryPending(), 3000);

    // Every 5 minutes: auto-retry any FAILED conversations
    setInterval(() => enrichment.retryPending(), 5 * 60 * 1000);
  });
});
