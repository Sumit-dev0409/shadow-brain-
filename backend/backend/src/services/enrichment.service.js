const openRouterService = require('./openrouter.service');
const conversationService = require('./conversation.service');
const { parseJsonResponse, validateMetadata, cleanConversationText } = require('../utils/validators');
const logger = require('../utils/logger');

// 429 messages that mean the daily quota is gone — retrying in 15s won't help
const DAILY_LIMIT_PHRASES = [
  'free-models-per-day',
  'rate limit exceeded',
  'quota exceeded',
];

function isDailyRateLimit(errorMessage = '') {
  const msg = errorMessage.toLowerCase();
  return DAILY_LIMIT_PHRASES.some(p => msg.includes(p));
}

class EnrichmentService {
  async process(conversationId, attempt = 1) {
    const conversation = await conversationService.getById(conversationId);
    if (!conversation) {
      logger.error(`Enrichment failed: Conversation not found: ${conversationId}`);
      return;
    }

    if (conversation.status === 'PROCESSING' && attempt === 1) {
      logger.info(`Enrichment for ${conversationId} already in progress. Skipping.`);
      return;
    }

    try {
      logger.info(`[ENRICHMENT START] attempt ${attempt} for ${conversationId}`);
      await conversationService.updateStatus(conversationId, 'PROCESSING');

      const text        = this.extractConversationText(conversation);
      const cleanedText = cleanConversationText(text);

      if (!cleanedText || cleanedText.length < 10) {
        throw new Error('Conversation content is too short for enrichment');
      }

      const response    = await openRouterService.extractMetadata(cleanedText);
      const rawMetadata = parseJsonResponse(response.content);
      const validation  = validateMetadata(rawMetadata);

      if (!validation.valid) {
        throw new Error(`Invalid metadata format: ${validation.errors.join(', ')}`);
      }

      const enrichment = {
        topic:              rawMetadata.topic,
        category:           rawMetadata.category,
        summary:            rawMetadata.summary,
        keywords:           Array.isArray(rawMetadata.keywords) ? rawMetadata.keywords : [],
        entities:           Array.isArray(rawMetadata.entities) ? rawMetadata.entities : [],
        importance_score:   Number(rawMetadata.importance_score) || 1,
        enriched_at:        new Date(),
        enrichment_version: '1.0.0',
        status:             'COMPLETED',
      };

      await conversationService.updateEnrichment(conversationId, enrichment);
      logger.info(`[ENRICHMENT DONE] ${conversationId}`);

    } catch (error) {
      logger.error(`[ENRICHMENT FAIL] attempt ${attempt} for ${conversationId}: ${error.message}`);

      // Daily quota exhausted — don't retry, keep as PENDING so startup re-enrichment picks it up
      if (isDailyRateLimit(error.message)) {
        await conversationService.updateStatus(conversationId, 'PENDING', null);
        logger.warn(`[RATE LIMIT] Daily quota hit — conversation ${conversationId} kept as PENDING for later retry`);
        return;
      }

      if (attempt < 3) {
        const delay = attempt * 15000;
        logger.info(`Retrying ${conversationId} in ${delay}ms (attempt ${attempt + 1})`);
        setTimeout(() => {
          this.process(conversationId, attempt + 1).catch(err => {
            logger.error(`Retry trigger failed: ${err.message}`);
          });
        }, delay);
      } else {
        await conversationService.updateStatus(conversationId, 'FAILED', `Failed after 3 attempts: ${error.message}`);
      }
    }
  }

  // Called on server startup — re-enriches anything stuck as PENDING or PROCESSING
  async retryPending() {
    const Conversation = require('../models/conversation.model');
    const pending = await Conversation.find({ status: { $in: ['PENDING', 'PROCESSING'] } }).select('_id').lean();

    if (pending.length === 0) {
      logger.info('[STARTUP] No pending conversations to enrich');
      return;
    }

    logger.info(`[STARTUP] Re-enriching ${pending.length} pending conversation(s)...`);

    for (let i = 0; i < pending.length; i++) {
      // Stagger by 3s each to avoid hammering the API
      setTimeout(() => {
        this.process(pending[i]._id.toString()).catch(err => {
          logger.error(`Startup re-enrich failed for ${pending[i]._id}: ${err.message}`);
        });
      }, i * 3000);
    }
  }

  extractConversationText(conversation) {
    return conversation.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }
}

module.exports = new EnrichmentService();
