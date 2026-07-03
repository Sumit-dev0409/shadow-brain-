const conversationService = require('../services/conversation.service');
const enrichmentService = require('../services/enrichment.service');
const groqService = require('../services/groq.service');
const logger = require('../utils/logger');

const createConversation = async (req, res, next) => {
  try {
    logger.info('DEBUG: [REQUEST RECEIVED] POST /api/conversations');
    logger.debug('DEBUG: Body:', JSON.stringify(req.body, null, 2));

    if (!req.body || Object.keys(req.body).length === 0) {
      logger.warn('DEBUG: Empty request body received');
      return res.status(400).json({ message: 'Empty request body' });
    }

    const conversation = await conversationService.createOrUpdate(req.body);
    logger.info(`[CAPTURE] ${conversation.platform} | "${conversation.title?.slice(0,50)}" | ${conversation.messages?.length} msgs | status: ${conversation.status}`);
    
    // Trigger enrichment immediately (no queue)
    setImmediate(() => {
      logger.info(`DEBUG: [ENRICHMENT TRIGGERED] for ${conversation._id}`);
      enrichmentService.process(conversation._id).catch(err => {
        logger.error(`DEBUG: Background enrichment failed for ${conversation._id}: ${err.message}`);
      });
    });

    res.status(202).json({
      message: 'Conversation received and enrichment started',
      id: conversation._id,
      status: 'PENDING'
    });
  } catch (error) {
    logger.error(`DEBUG: [CONTROLLER ERROR] ${error.message}`);
    next(error);
  }
};

const bulkCreateConversations = async (req, res, next) => {
  try {
    logger.info(`DEBUG: [REQUEST RECEIVED] POST /api/conversations/bulk - Count: ${req.body.conversations?.length}`);
    const { conversations } = req.body;
    if (!Array.isArray(conversations)) {
      return res.status(400).json({ message: 'conversations must be an array' });
    }

    const results = [];
    for (const convoData of conversations) {
      const convo = await conversationService.createOrUpdate(convoData);
      logger.info(`DEBUG: [CONTROLLER] Bulk item processed: ${convo._id}`);
      
      // Trigger enrichment immediately
      setImmediate(() => {
        logger.info(`DEBUG: [ENRICHMENT TRIGGERED] for ${convo._id}`);
        enrichmentService.process(convo._id).catch(err => {
          logger.error(`DEBUG: Background enrichment failed for ${convo._id}: ${err.message}`);
        });
      });
      results.push(convo._id);
    }

    res.status(202).json({
      message: `Received ${results.length} conversations, enrichment started`,
      ids: results
    });
  } catch (error) {
    logger.error(`DEBUG: [CONTROLLER ERROR] ${error.message}`);
    next(error);
  }
};

const listConversations = async (req, res, next) => {
  try {
    const { page, limit, platform } = req.query;
    const query = platform ? { platform } : {};
    const conversations = await conversationService.list(query, { page: Number(page), limit: Number(limit) });
    res.json(conversations);
  } catch (error) {
    next(error);
  }
};

const getConversationById = async (req, res, next) => {
  try {
    const conversation = await conversationService.getById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Not found' });
    res.json(conversation);
  } catch (error) {
    next(error);
  }
};

const getConversationStatus = async (req, res, next) => {
  try {
    const conversation = await conversationService.getById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Not found' });
    res.json({
      id: conversation._id,
      status: conversation.status,
      error: conversation.error
    });
  } catch (error) {
    next(error);
  }
};

const searchConversations = async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'query is required' });
    }

    const kw = query.toLowerCase();
    const words = kw.split(/\s+/).filter(w => w.length > 2);

    if (words.length === 0) {
      return res.json({ answer: 'Please provide a more specific query.', sources: [] });
    }

    const allConvs = await conversationService.list({}, { limit: 200 });

    const scored = allConvs
      .map(conv => {
        const text = [
          conv.title || '',
          conv.enrichment?.topic || '',
          conv.enrichment?.summary || '',
          ...(conv.enrichment?.keywords || []),
          ...conv.messages.map(m => m.content || '')
        ].join(' ').toLowerCase();

        const score = words.reduce((acc, w) => {
          const safe = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return acc + (text.match(new RegExp(safe, 'g')) || []).length;
        }, 0);

        return { conv, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (scored.length === 0) {
      return res.json({
        answer: `No conversations found related to "${query}". Try different keywords or make sure your conversations have been imported.`,
        sources: []
      });
    }

    const context = scored.map(({ conv }) => {
      const summary = conv.enrichment?.summary;
      const msgs = conv.messages.slice(0, 8)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${(m.content || '').slice(0, 400)}`)
        .join('\n');
      return [`### "${conv.title}" [${conv.platform}]`, summary ? `Summary: ${summary}` : '', msgs]
        .filter(Boolean).join('\n');
    }).join('\n\n---\n\n');

    const systemPrompt = `You are Brain Shadow, helping the user search their stored AI conversations.

User's question: "${query}"

Most relevant conversations:

${context}

Answer based on these conversations. Reference conversation title(s) when relevant. Be concise and direct. If the exact answer isn't present, share what related info was found.`;

    const result = await groqService.chat([{ role: 'user', content: query }], systemPrompt);

    const sources = scored.map(({ conv }) => ({
      id: conv._id,
      title: conv.title || 'Untitled',
      platform: conv.platform || 'unknown',
      summary: conv.enrichment?.summary || null,
    }));

    res.json({ answer: result.content, sources });
  } catch (err) {
    logger.error(`[Search] ${err.message}`);
    next(err);
  }
};

module.exports = {
  createConversation,
  bulkCreateConversations,
  listConversations,
  getConversationById,
  getConversationStatus,
  searchConversations,
};
