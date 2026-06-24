const { METADATA_SCHEMA } = require('../utils/validators');

/**
 * Service to handle DB operations for Conversations
 */
const Conversation = require('../models/conversation.model');
const logger = require('../utils/logger');

class ConversationService {
  async createOrUpdate(data) {
    const { platform, external_id, title, messages, saved_at, captured_at, url } = data;
    
    logger.info(`DEBUG: [BEFORE DB SAVE] ExternalId: ${external_id}, Platform: ${platform}`);

    // Normalize field names from extension payload
    const conversationData = {
      externalId: external_id,
      platform: platform ? platform.toLowerCase() : 'chatgpt',
      title: title || 'Untitled Conversation',
      messages: (messages || []).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || new Date().toISOString()
      })),
      status: 'PENDING', // Reset status on every update
      error: null,       // Clear previous errors
      metadata: {
        savedAtExtension: saved_at || captured_at,
        url: url
      }
    };

    try {
      const result = await Conversation.findOneAndUpdate(
        { externalId: external_id, platform: conversationData.platform },
        { $set: conversationData },
        { upsert: true, new: true, runValidators: true }
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
    return await Conversation.findByIdAndUpdate(id, { $set: update }, { new: true });
  }

  async updateEnrichment(id, enrichment) {
    logger.info(`DEBUG: [BEFORE METADATA SAVE] for ${id}`);
    
    // We use dot notation to update specific fields in metadata and keep existing ones
    // or we can fetch and merge. Dot notation is safer for concurrent updates.
    const updateData = {
      status: 'COMPLETED'
    };

    // Prefix enrichment keys with 'metadata.'
    Object.keys(enrichment).forEach(key => {
      updateData[`metadata.${key}`] = enrichment[key];
    });

    const result = await Conversation.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    logger.info(`DEBUG: [AFTER METADATA SAVE] for ${id}`);
    logger.info(`DEBUG: [FINAL DOCUMENT SAVED] for ${id}: ${JSON.stringify(result, null, 2)}`);

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
