require('dotenv').config();
const app        = require('./app');
const connectDB  = require('./config/db');
const logger     = require('./utils/logger');
const enrichment = require('./services/enrichment.service');

const PORT = process.env.PORT || 8000;

connectDB().then(() => {
  app.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    // Re-enrich any conversations left as PENDING/PROCESSING from previous run
    setTimeout(() => enrichment.retryPending(), 3000);
  });
});
