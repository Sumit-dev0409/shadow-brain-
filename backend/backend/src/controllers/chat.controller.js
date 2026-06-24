const openRouterService = require('../services/openrouter.service');
const logger            = require('../utils/logger');

const chat = async (req, res, next) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const result = await openRouterService.chat(messages, systemPrompt);
    res.json({ content: result.content, usage: result.usage });
  } catch (err) {
    logger.error(`[Chat] ${err.message}`);
    next(err);
  }
};

module.exports = { chat };
