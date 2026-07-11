const Conversation = require('../models/conversation.model');
const logger = require('../utils/logger');

class ConversationService {
  async createOrUpdate(data) {
    const startTime = Date.now();
    const { platform, external_id, title, messages, saved_at, captured_at, url } = data;

    console.log(`\n[SERVICE] ─── createOrUpdate START ───`);
    console.log(`[SERVICE] Input platform: "${platform}"`);
    console.log(`[SERVICE] Input external_id: "${external_id}"`);
    console.log(`[SERVICE] Input title: "${(title || '').substring(0, 60)}"`);
    console.log(`[SERVICE] Input messages: ${(messages || []).length} items`);
    console.log(`[SERVICE] Input url: "${(url || '').substring(0, 80)}"`);

    const normalizedPlatform = platform ? platform.toLowerCase() : 'chatgpt';
    console.log(`[SERVICE] Normalized platform: "${normalizedPlatform}"`);

    const newMessages = (messages || []).map(m => ({
      role: m.role,
      content: m.content || '',
      timestamp: m.timestamp || new Date().toISOString()
    }));

    const newHasContent = newMessages.some(m => (m.content || '').trim().length > 0);
    console.log(`[SERVICE] Messages with content: ${newHasContent}`);

    const conversationData = {
      externalId: external_id,
      platform: normalizedPlatform,
      title: title || 'Untitled Conversation',
      error: null,
      metadata: {
        savedAtExtension: saved_at || captured_at,
        url: url
      }
    };

    if (newHasContent) {
      conversationData.messages = newMessages;
    }

    const setOnInsert = { status: 'PENDING' };
    if (!newHasContent) {
      setOnInsert.messages = newMessages;
    }

    const filter = { externalId: external_id, platform: normalizedPlatform };
    console.log(`[SERVICE] MongoDB filter: ${JSON.stringify(filter)}`);
    console.log(`[SERVICE] MongoDB $set keys: ${Object.keys(conversationData).join(', ')}`);
    console.log(`[SERVICE] MongoDB upsert: true, runValidators: true`);

    try {
      console.log(`[SERVICE] Executing Conversation.findOneAndUpdate...`);
      const result = await Conversation.findOneAndUpdate(
        filter,
        {
          $set: conversationData,
          $setOnInsert: setOnInsert,
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );

      // ── DEBUG: Confirm the write ────────────────────────────────
      console.log(`[SERVICE] findOneAndUpdate returned: ${result ? 'DOCUMENT' : 'NULL'}`);
      if (result) {
        console.log(`[SERVICE] Result _id: ${result._id}`);
        console.log(`[SERVICE] Result platform: ${result.platform}`);
        console.log(`[SERVICE] Result externalId: ${result.externalId}`);
        console.log(`[SERVICE] Result status: ${result.status}`);
        console.log(`[SERVICE] Result messages count: ${result.messages?.length}`);
        console.log(`[SERVICE] Result createdAt: ${result.createdAt}`);
        console.log(`[SERVICE] Result updatedAt: ${result.updatedAt}`);
      } else {
        console.error(`[SERVICE] !!! findOneAndUpdate returned NULL — write may have failed !!!`);
      }

      // ── DEBUG: Verify by reading back ───────────────────────────
      try {
        const verify = await Conversation.findOne(filter).lean();
        if (verify) {
          console.log(`[SERVICE] VERIFY READ-BACK: Document EXISTS in DB (_id=${verify._id})`);
        } else {
          console.error(`[SERVICE] !!! VERIFY READ-BACK: Document NOT FOUND in DB !!!`);
          console.error(`[SERVICE] This means the upsert did NOT persist to Atlas`);
        }
      } catch (verifyErr) {
        console.error(`[SERVICE] VERIFY READ-BACK failed: ${verifyErr.message}`);
      }

      console.log(`[SERVICE] DB operation completed in ${Date.now() - startTime}ms`);
      console.log(`[SERVICE] ─── createOrUpdate END (success) ───\n`);
      return result;
    } catch (error) {
      console.error(`[SERVICE] ─── createOrUpdate DB ERROR ───`);
      console.error(`[SERVICE] Error name: ${error.name}`);
      console.error(`[SERVICE] Error message: ${error.message}`);
      console.error(`[SERVICE] Error code: ${error.code}`);
      console.error(`[SERVICE] Error stack: ${error.stack}`);
      if (error.errors) {
        console.error(`[SERVICE] Mongoose validation errors:`);
        for (const [field, err] of Object.entries(error.errors)) {
          console.error(`[SERVICE]   - ${field}: ${err.message} (kind: ${err.kind})`);
        }
      }
      if (error.code) {
        console.error(`[SERVICE] MongoDB error code ${error.code} means: ${
          error.code === 11000 ? 'DUPLICATE KEY' :
          error.code === 121 ? 'VALIDATION FAILED' :
          error.code === 13 ? 'UNAUTHORIZED' :
          error.code === 20 ? 'BAD_COMMAND' :
          'UNKNOWN'
        }`);
      }
      console.error(`[SERVICE] ─── createOrUpdate END (error) ───\n`);
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
    console.log(`[SERVICE] updateStatus: id=${id}, status=${status}, error=${error}`);
    const update = { status };
    if (error === null) {
      update.error = null;
    } else if (error) {
      update.error = error;
    }
    const result = await Conversation.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' });
    console.log(`[SERVICE] updateStatus result: ${result ? 'OK' : 'NULL (doc not found)'}`);
    return result;
  }

  async updateEnrichment(id, enrichment) {
    console.log(`[SERVICE] ─── updateEnrichment START for ${id} ───`);

    const updateData = {
      status: 'COMPLETED',
      'enrichment.topic':           enrichment.topic,
      'enrichment.category':        enrichment.category,
      'enrichment.summary':         enrichment.summary,
      'enrichment.keywords':        enrichment.keywords,
      'enrichment.entities':        enrichment.entities,
      'enrichment.importanceScore': enrichment.importance_score,
      'enrichment.enrichedAt':      enrichment.enriched_at,
      'enrichment.version':         enrichment.enrichment_version,
      'metadata.topic':               enrichment.topic,
      'metadata.category':            enrichment.category,
      'metadata.summary':             enrichment.summary,
      'metadata.keywords':            enrichment.keywords,
      'metadata.entities':            enrichment.entities,
      'metadata.importance_score':    enrichment.importance_score,
      'metadata.enriched_at':         enrichment.enriched_at,
      'metadata.enrichment_version':  enrichment.enrichment_version,
      'metadata.status':              'COMPLETED',
      error: null,
    };

    console.log(`[SERVICE] Enrichment topic: "${enrichment.topic}"`);
    console.log(`[SERVICE] Enrichment version: "${enrichment.enrichment_version}"`);

    try {
      const result = await Conversation.findByIdAndUpdate(
        id,
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (result) {
        console.log(`[SERVICE] Enrichment saved: status=${result.status}, topic=${result.enrichment?.topic}`);
      } else {
        console.error(`[SERVICE] !!! Enrichment update returned NULL — doc not found for id: ${id} !!!`);
      }

      console.log(`[SERVICE] ─── updateEnrichment END ───`);
      return result;
    } catch (error) {
      console.error(`[SERVICE] Enrichment save FAILED: ${error.message}`);
      console.error(`[SERVICE] Enrichment error stack: ${error.stack}`);
      throw error;
    }
  }

  async list(query = {}, options = {}) {
    const { limit = 20, page = 1, sort = { createdAt: -1 } } = options;
    console.log(`[SERVICE] list() query: ${JSON.stringify(query)}, page: ${page}, limit: ${limit}`);
    const results = await Conversation.find(query)
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit);
    console.log(`[SERVICE] list() returned ${results.length} results`);
    return results;
  }
}

module.exports = new ConversationService();
