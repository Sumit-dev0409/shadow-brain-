const enrichment = require('../services/enrichment.service');
const logger = require('../utils/logger');

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set as an env var on the project — this rejects any other caller.
const retryPending = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.header('Authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  }

  try {
    await enrichment.retryPending();
    res.json({ ok: true });
  } catch (error) {
    logger.error(`[Cron] retryPending failed: ${error.message}`);
    res.status(500).json({ message: 'Retry job failed' });
  }
};

module.exports = { retryPending };
