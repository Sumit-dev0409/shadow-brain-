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
