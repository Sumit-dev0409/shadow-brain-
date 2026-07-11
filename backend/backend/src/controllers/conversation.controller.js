const conversationService = require('../services/conversation.service');
const enrichmentService = require('../services/enrichment.service');
const groqService = require('../services/groq.service');
const logger = require('../utils/logger');

const createConversation = async (req, res, next) => {
  const startTime = Date.now();
  try {
    console.log(`\n[CONTROLLER] ─── createConversation START ───`);
    console.log(`[CONTROLLER] Timestamp: ${new Date().toISOString()}`);
    console.log(`[CONTROLLER] Body keys: ${Object.keys(req.body || {}).join(', ')}`);

    if (!req.body || Object.keys(req.body).length === 0) {
      console.warn(`[CONTROLLER] Empty request body — returning 400`);
      return res.status(400).json({ message: 'Empty request body' });
    }

    const { platform, external_id, title, messages } = req.body;
    console.log(`[CONTROLLER] platform: "${platform}"`);
    console.log(`[CONTROLLER] external_id: "${external_id}"`);
    console.log(`[CONTROLLER] title: "${(title || '').substring(0, 60)}"`);
    console.log(`[CONTROLLER] messages count: ${(messages || []).length}`);

    // Validate platform enum before hitting the service
    const VALID_PLATFORMS = ['chatgpt', 'claude', 'gemini', 'deepseek', 'blackbox', 'copilot', 'mscopilot', 'perplexity', 'grok'];
    const normalizedPlatform = platform ? platform.toLowerCase() : 'chatgpt';
    if (!VALID_PLATFORMS.includes(normalizedPlatform)) {
      console.error(`[CONTROLLER] INVALID PLATFORM: "${platform}" → normalized "${normalizedPlatform}"`);
      console.error(`[CONTROLLER] Valid platforms: ${VALID_PLATFORMS.join(', ')}`);
      return res.status(400).json({
        message: `Invalid platform: "${platform}". Valid: ${VALID_PLATFORMS.join(', ')}`
      });
    }

    console.log(`[CONTROLLER] Calling conversationService.createOrUpdate...`);
    const conversation = await conversationService.createOrUpdate(req.body);
    console.log(`[CONTROLLER] Service returned: _id=${conversation._id}, platform=${conversation.platform}, status=${conversation.status}`);
    console.log(`[CONTROLLER] Messages stored: ${conversation.messages?.length}`);
    console.log(`[CONTROLLER] DB write confirmed in ${Date.now() - startTime}ms`);
    
    // Trigger enrichment immediately (no queue)
    setImmediate(() => {
      console.log(`[CONTROLLER] Triggering enrichment for ${conversation._id}`);
      enrichmentService.process(conversation._id).catch(err => {
        console.error(`[CONTROLLER] Background enrichment failed for ${conversation._id}: ${err.message}`);
        console.error(`[CONTROLLER] Enrichment error stack: ${err.stack}`);
      });
    });

    const responseBody = {
      message: 'Conversation received and enrichment started',
      id: conversation._id,
      status: 'PENDING'
    };
    console.log(`[CONTROLLER] Sending 202 response: ${JSON.stringify(responseBody)}`);
    console.log(`[CONTROLLER] ─── createConversation END (success) ───\n`);
    res.status(202).json(responseBody);
  } catch (error) {
    console.error(`[CONTROLLER] ─── createConversation ERROR ───`);
    console.error(`[CONTROLLER] Error message: ${error.message}`);
    console.error(`[CONTROLLER] Error name: ${error.name}`);
    console.error(`[CONTROLLER] Error stack: ${error.stack}`);
    if (error.errors) {
      console.error(`[CONTROLLER] Validation errors:`, JSON.stringify(error.errors, null, 2));
    }
    next(error);
  }
};

const bulkCreateConversations = async (req, res, next) => {
  const startTime = Date.now();
  try {
    console.log(`\n[CONTROLLER] ─── bulkCreateConversations START ───`);
    const { conversations } = req.body;
    console.log(`[CONTROLLER] Bulk payload: ${Array.isArray(conversations) ? conversations.length + ' items' : 'NOT AN ARRAY'}`);
    
    if (!Array.isArray(conversations)) {
      console.error(`[CONTROLLER] conversations is not an array: ${typeof conversations}`);
      return res.status(400).json({ message: 'conversations must be an array' });
    }

    const results = [];
    const errors = [];
    for (let i = 0; i < conversations.length; i++) {
      const convoData = conversations[i];
      console.log(`[CONTROLLER] Bulk item ${i + 1}/${conversations.length}: platform="${convoData.platform}", external_id="${convoData.external_id}", title="${(convoData.title || '').substring(0, 40)}"`);
      try {
        const convo = await conversationService.createOrUpdate(convoData);
        console.log(`[CONTROLLER] Bulk item ${i + 1} OK: _id=${convo._id}`);
        
        setImmediate(() => {
          enrichmentService.process(convo._id).catch(err => {
            console.error(`[CONTROLLER] Bulk enrichment failed for ${convo._id}: ${err.message}`);
          });
        });
        results.push(convo._id);
      } catch (itemError) {
        console.error(`[CONTROLLER] Bulk item ${i + 1} FAILED: ${itemError.message}`);
        console.error(`[CONTROLLER] Item error stack: ${itemError.stack}`);
        errors.push({ index: i, error: itemError.message, platform: convoData.platform });
      }
    }

    console.log(`[CONTROLLER] Bulk complete: ${results.length} success, ${errors.length} failed, ${Date.now() - startTime}ms`);
    console.log(`[CONTROLLER] ─── bulkCreateConversations END ───\n`);
    res.status(202).json({
      message: `Received ${results.length} conversations, enrichment started`,
      ids: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error(`[CONTROLLER] ─── bulkCreateConversations ERROR ───`);
    console.error(`[CONTROLLER] Error: ${error.message}`);
    console.error(`[CONTROLLER] Stack: ${error.stack}`);
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

const buildFallbackAnswer = (query, scored) => {
  const topResults = scored.slice(0, 3);
  const sentences = topResults.map(({ conv }, index) => {
    const date = conv.createdAt
      ? new Date(conv.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'Unknown date';
    const platform = conv.platform || 'unknown';
    const summarySource = conv.enrichment?.summary || conv.metadata?.summary;
    const detail = summarySource || (conv.messages?.[0]?.content || 'The conversation included relevant discussion about your search.').replace(/\s+/g, ' ').slice(0, 140);
    return `${index + 1}. ${conv.title || 'Untitled'} on ${platform} (${date}) discussed ${detail}`;
  });

  return `I found ${scored.length} conversation${scored.length === 1 ? '' : 's'} related to "${query}". ${sentences.join(' ')}.`;
};

const searchConversations = async (req, res, next) => {
  try {
    const { query, platforms } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'query is required' });
    }

    const kw = query.toLowerCase();
    const words = kw.split(/\s+/).filter(w => w.length > 1);

    if (words.length === 0) {
      return res.json({ answer: 'Please provide a more specific query.', sources: [] });
    }

    // Prefix-aware matching: \b at start so "mongo" matches "mongodb", "mongodb" etc.
    const wordRegexes = words.map(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'));

    const dbFilter = Array.isArray(platforms) && platforms.length > 0
      ? { platform: { $in: platforms } }
      : {};
    const allConvs = await conversationService.list(dbFilter, { limit: 200 });

    const scored = allConvs
      .map(conv => {
        const metaText = [
          conv.title || '',
          conv.enrichment?.topic || '',
          conv.enrichment?.summary || '',
          ...(conv.enrichment?.keywords || []),
        ].join(' ');

        // Score each message individually so we can extract only the relevant ones
        const scoredMsgs = conv.messages.map(m => {
          const content = m.content || '';
          const hits = wordRegexes.reduce((acc, re) => {
            re.lastIndex = 0;
            return acc + (content.match(re) || []).length;
          }, 0);
          return { msg: m, hits };
        });

        const metaScore = wordRegexes.reduce((acc, re) => {
          re.lastIndex = 0;
          return acc + (metaText.match(re) || []).length;
        }, 0);

        const totalScore = metaScore + scoredMsgs.reduce((a, x) => a + x.hits, 0);
        // Keep only messages that actually mention the query terms
        const relevantMsgs = scoredMsgs.filter(x => x.hits > 0).map(x => x.msg);

        return { conv, score: totalScore, relevantMsgs };
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

    const context = scored.map(({ conv, relevantMsgs }, i) => {
      const topic = conv.enrichment?.topic ? `Topic: ${conv.enrichment.topic}` : '';
      const summary = conv.enrichment?.summary ? `Summary: ${conv.enrichment.summary}` : '';

      // Only include messages that actually matched the query — no fallback to unrelated messages
      const msgs = relevantMsgs.slice(0, 10)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${(m.content || '').slice(0, 500)}`)
        .join('\n');

      return [
        `CONVERSATION ${i + 1}:`,
        `Title: ${conv.title || 'Untitled'}`,
        `Platform: ${conv.platform}`,
        topic, summary,
        msgs ? 'Relevant messages:' : '',
        msgs,
      ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');

    const systemPrompt = `You are Brain Shadow, an AI memory assistant.

The user searched for: "${query}"

Here are the matching conversations with their relevant messages:

${context}

Write 2-3 plain sentences summarising what was discussed about "${query}". Your response must:
- Be written in plain English sentences (no markdown, no bullet points, no headers)
- Mention the platform name (e.g. ChatGPT, Gemini) for each conversation referenced
- Only describe what was actually in the messages shown above
- Not include steps, code, or detailed explanations`;

    // Message-level sources: one entry per matched message — no fallback to unrelated messages
    const sources = [];
    for (const { conv, relevantMsgs } of scored) {
      if (relevantMsgs.length > 0) {
        for (const msg of relevantMsgs.slice(0, 4)) {
          sources.push({
            id: msg._id?.toString() || conv._id.toString(),
            convId: conv._id.toString(),
            title: conv.title || 'Untitled',
            platform: conv.platform || 'unknown',
            role: msg.role,
            snippet: (msg.content || '').slice(0, 200),
            keywords: conv.enrichment?.keywords || [],
            summary: conv.enrichment?.summary || null,
          });
        }
      } else {
        // Conversation matched on title/topic/summary/keywords only — no single message to point to
        sources.push({
          id: conv._id.toString(),
          convId: conv._id.toString(),
          title: conv.title || 'Untitled',
          platform: conv.platform || 'unknown',
          role: null,
          snippet: null,
          keywords: conv.enrichment?.keywords || [],
          summary: conv.enrichment?.summary || null,
        });
      }
    }

    let answer;
    try {
      const result = await groqService.chat([{ role: 'user', content: query }], systemPrompt);
      answer = result.content;
    } catch (groqErr) {
      logger.error(`[Search] Groq failed: ${groqErr.message}`);
      answer = buildFallbackAnswer(query, scored);
    }

    res.json({ answer, sources });
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
