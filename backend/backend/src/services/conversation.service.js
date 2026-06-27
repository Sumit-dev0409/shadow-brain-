const Conversation = require('../models/conversation.model');
const logger = require('../utils/logger');

class ConversationService {
  async createOrUpdate(data) {
    const { platform, external_id, title, messages, saved_at, captured_at, url } = data;
    
    logger.info(`DEBUG: [BEFORE DB SAVE] ExternalId: ${external_id}, Platform: ${platform}`);

    // Normalize field names from extension payload
    const normalizedPlatform = platform ? platform.toLowerCase() : 'chatgpt';
    const conversationData = {
      externalId: external_id,
      platform: normalizedPlatform,
      title: title || 'Untitled Conversation',
      messages: (messages || []).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || new Date().toISOString()
      })),
      error: null,
      metadata: {
        savedAtExtension: saved_at || captured_at,
        url: url
      }
    };

    try {
      const result = await Conversation.findOneAndUpdate(
        { externalId: external_id, platform: normalizedPlatform },
        {
          $set: conversationData,
          // Only set status to PENDING on first insert — don't reset COMPLETED conversations
          $setOnInsert: { status: 'PENDING' }
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );
      logger.info(`DEBUG: [AFTER DB SAVE SUCCESS] Doc ID: ${result._id}`);
      return result;
    } catch (error) {
      logger.error(`DEBUG: [DB SAVE ERROR] ${error.message}`);
      throw error;
    }
  }

  async getById(id) {
    return await Conversation.findById(id);
  }

  async getByExternalId(externalId, platform) {
    return await Conversation.findOne({ externalId, platform });
  }

  async updateStatus(id, status, error = null) {
    const update = { status };
    if (error) update.error = error;
    return await Conversation.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' });
  }

  async updateEnrichment(id, enrichment) {
    logger.info(`DEBUG: [BEFORE METADATA SAVE] for ${id}`);

    const updateData = {
      status: 'COMPLETED',
      // Populate the enrichment subdocument (camelCase field names per schema)
      'enrichment.topic':           enrichment.topic,
      'enrichment.category':        enrichment.category,
      'enrichment.summary':         enrichment.summary,
      'enrichment.keywords':        enrichment.keywords,
      'enrichment.entities':        enrichment.entities,
      'enrichment.importanceScore': enrichment.importance_score,
      'enrichment.enrichedAt':      enrichment.enriched_at,
      'enrichment.version':         enrichment.enrichment_version,
      // Also write to metadata (snake_case) for backward compat
      'metadata.topic':               enrichment.topic,
      'metadata.category':            enrichment.category,
      'metadata.summary':             enrichment.summary,
      'metadata.keywords':            enrichment.keywords,
      'metadata.entities':            enrichment.entities,
      'metadata.importance_score':    enrichment.importance_score,
      'metadata.enriched_at':         enrichment.enriched_at,
      'metadata.enrichment_version':  enrichment.enrichment_version,
      'metadata.status':              'COMPLETED',
    };

    const result = await Conversation.findByIdAndUpdate(
      id,
      { $set: updateData },
      { returnDocument: 'after' }
    );

    logger.info(`DEBUG: [AFTER METADATA SAVE] for ${id}`);
    return result;
  }

  async list(query = {}, options = {}) {
    const { limit = 20, page = 1, sort = { createdAt: -1 } } = options;
    return await Conversation.find(query)
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit);
  }
}

module.exports = new ConversationService();
