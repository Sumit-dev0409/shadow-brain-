const OpenAI = require('openai');
const groqService = require('./groq.service');
const conversationService = require('./conversation.service');
const { parseJsonResponse, validateMetadata, cleanConversationText } = require('../utils/validators');
const logger = require('../utils/logger');

// ── Cerebras fallback client ───────────────────────────────
const cerebrasClient = process.env.CEREBRAS_API_KEY
  ? new OpenAI({
      apiKey:  process.env.CEREBRAS_API_KEY,
      baseURL: 'https://api.cerebras.ai/v1',
      timeout: 30000,
    })
  : null;

// qwen-3-32b: high-quality, ~14,400 req/day free on Cerebras
const CEREBRAS_MODEL = 'qwen-3-32b';

function isRateLimit(msg = '') {
  return msg.includes('429') || msg.toLowerCase().includes('rate limit');
}

// ── Metadata extraction prompt (shared) ───────────────────
function buildPrompt(text) {
  return `Extract metadata from this conversation. Reply with ONLY valid JSON, no markdown, no explanation.

JSON format:
{"topic":"3-8 word topic","category":"Technical|Business|Education|Creative|Troubleshooting|Question|Research|Planning|Implementation|Review|Other","summary":"50-100 word summary","keywords":["kw1","kw2"],"entities":["entity1"],"importance_score":1}

importance_score: 1=casual, 2=simple question, 3=useful info, 4=project work, 5=highly valuable

Conversation:
${text}`;
}

// ── Tier 2: Cerebras ──────────────────────────────────────
async function extractWithCerebras(text) {
  if (!cerebrasClient) throw new Error('No Cerebras API key configured');
  const response = await cerebrasClient.chat.completions.create({
    model:       CEREBRAS_MODEL,
    messages:    [{ role: 'user', content: buildPrompt(text) }],
    max_tokens:  450,
    temperature: 0.1,
  });
  return response.choices[0].message.content;
}

// ── Tier 3: Local (no API, always works) ──────────────────
function localEnrich(conversation) {
  const messages = conversation.messages || [];
  const userMsgs = messages.filter(m => m.role === 'user');
  const firstUser = userMsgs[0]?.content || conversation.title || '';

  const topic = firstUser.split(/\s+/).slice(0, 8).join(' ').slice(0, 80) || 'General Conversation';

  const allText = userMsgs.map(m => m.content).join(' ');
  const stopWords = new Set(['that', 'this', 'with', 'have', 'from', 'they', 'will', 'been', 'were', 'what', 'when', 'your', 'about', 'would', 'could', 'should', 'their', 'there', 'which', 'these', 'those']);
  const keywords = [...new Set(allText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [])]
    .filter(w => !stopWords.has(w)).slice(0, 10);

  const techWords = ['code', 'function', 'error', 'bug', 'api', 'database', 'python', 'javascript', 'react', 'server', 'deploy', 'git', 'css', 'html', 'sql', 'debug'];
  const category = techWords.some(w => allText.toLowerCase().includes(w)) ? 'Technical' : 'Other';

  return {
    topic,
    category,
    summary:            firstUser.slice(0, 200) || topic,
    keywords,
    entities:           [],
    importance_score:   3,
    enriched_at:        new Date(),
    enrichment_version: 'local-1.0',
    status:             'COMPLETED',
    message_count:      messages.length,
  };
}

// ── Round-robin counter (alternates Groq ↔ Cerebras) ──────
let _turn = 0;

// ── Primary pipeline: Groq → Cerebras → Local ─────────────
async function extractMetadata(cleanedText, conversation) {
  const useGroqFirst = (_turn++ % 2) === 0;
  const providers = useGroqFirst
    ? ['groq', 'cerebras']
    : ['cerebras', 'groq'];

  for (const provider of providers) {
    try {
      let content;
      if (provider === 'groq') {
        const res = await groqService.extractMetadata(cleanedText);
        content = res.content;
      } else {
        content = await extractWithCerebras(cleanedText);
      }
      const rawMetadata = parseJsonResponse(content);
      validateMetadata(rawMetadata);
      logger.info(`[ENRICHMENT] ${provider} succeeded`);
      return { ...buildEnrichment(rawMetadata), enrichment_version: `1.0.0-${provider}`, message_count: conversation.messages.length };
    } catch (err) {
      if (isRateLimit(err.message)) {
        logger.warn(`[RATE LIMIT] ${provider} quota hit — switching to other provider`);
        continue;
      }
      logger.warn(`[${provider.toUpperCase()} FAIL] ${err.message}`);
    }
  }

  // Both providers failed or rate-limited — use local
  logger.warn('[ENRICHMENT] Both providers unavailable — using local enrichment');
  return localEnrich(conversation);
}

function buildEnrichment(raw) {
  return {
    topic:            raw.topic,
    category:         raw.category,
    summary:          raw.summary,
    keywords:         Array.isArray(raw.keywords) ? raw.keywords : [],
    entities:         Array.isArray(raw.entities) ? raw.entities : [],
    importance_score: Number(raw.importance_score) || 3,
    enriched_at:      new Date(),
    status:           'COMPLETED',
  };
}

// ══════════════════════════════════════════════════════════
class EnrichmentService {
  hasUsableEnrichment(conversation = {}) {
    const enrichment = conversation.enrichment || {};
    const metadata = conversation.metadata || {};
    return Boolean(
      enrichment.topic || enrichment.summary || metadata.topic || metadata.summary
    );
  }

  async process(conversationId, attempt = 1) {
    const conversation = await conversationService.getById(conversationId);
    if (!conversation) {
      logger.error(`Enrichment failed: Conversation not found: ${conversationId}`);
      return;
    }

    // Only skip if enrichment exists AND the conversation hasn't grown since —
    // this used to skip unconditionally once a conversation was ever
    // enriched, so re-captures that added new messages (e.g. a continued
    // chat) would keep their summary/topic frozen at the original content
    // forever, even though messages itself was correctly getting updated.
    const currentCount = (conversation.messages || []).length;
    const enrichedAtCount = conversation.enrichment?.messageCountAtEnrichment;
    if (
      this.hasUsableEnrichment(conversation) &&
      conversation.status === 'COMPLETED' &&
      enrichedAtCount === currentCount
    ) {
      logger.info(`[ENRICHMENT SKIP] ${conversationId} already has enrichment data for current message count (${currentCount}).`);
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

      if (!cleanedText || cleanedText.length < 3) {
        throw new Error('Conversation content is empty');
      }

      const enrichment = await extractMetadata(cleanedText, conversation);
      await conversationService.updateEnrichment(conversationId, enrichment);
      logger.info(`[ENRICHMENT DONE] ${conversationId} (${enrichment.enrichment_version || 'local'})`);

    } catch (error) {
      logger.error(`[ENRICHMENT FAIL] attempt ${attempt} for ${conversationId}: ${error.message}`);

      if (attempt < 3) {
        logger.info(`Retrying ${conversationId} (attempt ${attempt + 1})`);
        this.process(conversationId, attempt + 1).catch(err =>
          logger.error(`Retry trigger failed: ${err.message}`)
        );
      } else {
        await conversationService.updateStatus(conversationId, 'FAILED', error.message);
        logger.warn(`[ENRICHMENT] Marked as FAILED after 3 attempts`);
      }
    }
  }

  async retryPending() {
    const Conversation = require('../models/conversation.model');

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const resetResult = await Conversation.updateMany(
      { status: { $in: ['FAILED', 'PROCESSING'] }, updatedAt: { $lt: fiveMinutesAgo } },
      { $set: { status: 'PENDING', error: null } }
    );

    if (resetResult.modifiedCount > 0) {
      logger.info(`[RETRY] Reset ${resetResult.modifiedCount} stale FAILED/PROCESSING → PENDING`);
    }

    const pending = await Conversation.find({
      $or: [
        { status: { $in: ['PENDING', 'PROCESSING', 'FAILED', 'RETRYING'] } },
        {
          status: 'COMPLETED',
          $or: [
            { 'enrichment.topic': { $exists: false } },
            { 'enrichment.summary': { $exists: false } },
            { 'metadata.topic': { $exists: false } },
            { 'metadata.summary': { $exists: false } },
            { 'enrichment.topic': null },
            { 'enrichment.summary': null },
            { 'metadata.topic': null },
            { 'metadata.summary': null },
          ],
        },
      ],
    }).select('_id title status').lean();

    if (pending.length === 0) {
      logger.info('[RETRY] No conversations need enrichment right now');
      return;
    }

    logger.info(`[RETRY] Enriching ${pending.length} conversation(s)...`);

    pending.forEach((conv, i) => {
      setTimeout(() => {
        this.process(conv._id.toString()).catch(err => {
          logger.error(`[RETRY] Failed for "${conv.title}": ${err.message}`);
        });
      }, i * 2000);
    });
  }

  extractConversationText(conversation) {
    return conversation.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
  }
}

module.exports = new EnrichmentService();
