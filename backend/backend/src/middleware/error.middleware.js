const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  console.error(`\n[ERROR HANDLER] ═══════════════════════════════════════`);
  console.error(`[ERROR HANDLER] Route: ${req.method} ${req.originalUrl}`);
  console.error(`[ERROR HANDLER] Error name: ${err.name}`);
  console.error(`[ERROR HANDLER] Error message: ${err.message}`);
  console.error(`[ERROR HANDLER] Error code: ${err.code || 'N/A'}`);
  console.error(`[ERROR HANDLER] Full stack trace:`);
  console.error(err.stack);
  if (err.errors) {
    console.error(`[ERROR HANDLER] Mongoose validation errors:`);
    for (const [field, e] of Object.entries(err.errors)) {
      console.error(`[ERROR HANDLER]   - ${field}: ${e.message} (kind: ${e.kind}, value: ${JSON.stringify(e.value)?.substring(0, 100)})`);
    }
  }
  console.error(`[ERROR HANDLER] ═══════════════════════════════════════\n`);

  logger.error(err.stack);

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = { errorHandler };
