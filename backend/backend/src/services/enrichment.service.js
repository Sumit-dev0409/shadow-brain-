const openRouterService = require('./openrouter.service');
const conversationService = require('./conversation.service');
const { parseJsonResponse, validateMetadata, cleanConversationText } = require('../utils/validators');
const logger = require('../utils/logger');

class EnrichmentService {
  async process(conversationId, attempt = 1) {
    const conversation = await conversationService.getById(conversationId);
    if (!conversation) {
      logger.error(`Enrichment failed: Conversation not found: ${conversationId}`);
      return;
    }

    // Safety fix: Prevent multiple enrichment runs on same document
    if (conversation.status === 'PROCESSING' && attempt === 1) {
      logger.info(`Enrichment for ${conversationId} already in progress. Skipping.`);
      return;
    }

    try {
      logger.info(`DEBUG: [ENRICHMENT START] for ${conversationId}`);
      await conversationService.updateStatus(conversationId, 'PROCESSING');

      const text = this.extractConversationText(conversation);
      logger.debug(`DEBUG: Extracted text length: ${text.length}`);
      const cleanedText = cleanConversationText(text);

      if (!cleanedText || cleanedText.length < 10) {
        throw new Error('Conversation content is too short for enrichment');
      }

      logger.info(`DEBUG: [OPENROUTER REQUEST SENT] for ${conversationId}`);
      const response = await openRouterService.extractMetadata(cleanedText);
      logger.info(`DEBUG: [OPENROUTER RAW RESPONSE] for ${conversationId}: ${JSON.stringify(response.content, null, 2)}`);
      
      const rawMetadata = parseJsonResponse(response.content);
      logger.info(`DEBUG: [METADATA GENERATED] for ${conversationId}: ${JSON.stringify(rawMetadata, null, 2)}`);
      const validation = validateMetadata(rawMetadata);

      if (!validation.valid) {
        throw new Error(`Invalid metadata format: ${validation.errors.join(', ')}`);
      }

      const enrichment = {
        topic:               rawMetadata.topic,
        category:            rawMetadata.category,
        summary:             rawMetadata.summary,
        keywords:            Array.isArray(rawMetadata.keywords)  ? rawMetadata.keywords  : [],
        entities:            Array.isArray(rawMetadata.entities)  ? rawMetadata.entities  : [],
        importance_score:    Number(rawMetadata.importance_score) || 1,
        enriched_at:         new Date(),
        enrichment_version:  '1.0.0',
        status:              'COMPLETED',
      };

      await conversationService.updateEnrichment(conversationId, enrichment);
      logger.info(`Successfully enriched conversation: ${conversationId}`);
      
    } catch (error) {
      logger.error(`Enrichment attempt ${attempt} failed for ${conversationId}: ${error.message}`);

      if (attempt < 3) {
        const delay = attempt * 15000; // Exponential backoff (15s, 30s) — gives rate limits time to clear
        logger.info(`Retrying enrichment for ${conversationId} in ${delay}ms... (Attempt ${attempt + 1})`);
        
        setTimeout(() => {
          this.process(conversationId, attempt + 1).catch(err => {
            logger.error(`Retry attempt ${attempt + 1} trigger failed: ${err.message}`);
          });
        }, delay);
      } else {
        // Last attempt failed
        await conversationService.updateStatus(conversationId, 'FAILED', `Enrichment failed after 3 attempts: ${error.message}`);
        logger.error(`Setting conversation ${conversationId} to FAILED status`);
      }
    }
  }

  extractConversationText(conversation) {
    return conversation.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }
}

module.exports = new EnrichmentService();
