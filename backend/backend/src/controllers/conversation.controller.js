const conversationService = require('../services/conversation.service');
const enrichmentService = require('../services/enrichment.service');
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

module.exports = {
  createConversation,
  bulkCreateConversations,
  listConversations,
  getConversationById,
  getConversationStatus
};
