const OpenAI = require('openai');
const config = require('../config/groq');
const logger = require('../utils/logger');

class GroqService {
  constructor() {
    // Lazy: don't touch the OpenAI SDK at construction time. It throws
    // immediately if apiKey is missing, and this service is instantiated
    // once as a module-level singleton — an unset key (e.g. when running
    // on the Cerebras fallback only) would otherwise crash the whole
    // process at require-time, before any request ever needs Groq.
    //
    // Separate clients for chat vs. summary/enrichment so each workload
    // gets its own key and quota (see config/groq.js).
    this._chatClient    = null;
    this._summaryClient = null;
  }

  get chatClient() {
    if (!this._chatClient) {
      if (!config.apiKeyChat) throw new Error('No Groq chat API key configured');
      this._chatClient = new OpenAI({
        apiKey:  config.apiKeyChat,
        baseURL: config.baseUrl,
        timeout: 30000,
      });
    }
    return this._chatClient;
  }

  get summaryClient() {
    if (!this._summaryClient) {
      if (!config.apiKeySummary) throw new Error('No Groq summary API key configured');
      this._summaryClient = new OpenAI({
        apiKey:  config.apiKeySummary,
        baseURL: config.baseUrl,
        timeout: 30000,
      });
    }
    return this._summaryClient;
  }

  async chat(messages, systemPrompt = null) {
    const allMessages = [];

    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    } else {
      allMessages.push({
        role: 'system',
        content: 'You are Brain Shadow, a helpful AI assistant. You have access to the user\'s captured conversations from various AI platforms. Be concise, clear, and helpful.',
      });
    }

    allMessages.push(...messages.map(m => ({ role: m.role, content: m.content })));

    const response = await this.chatClient.chat.completions.create({
      model:       config.model,
      messages:    allMessages,
      max_tokens:  2048,
      temperature: 0.7,
    });

    return {
      content: response.choices[0].message.content,
      usage:   response.usage,
    };
  }

  async extractMetadata(conversationText) {
    const prompt = `Extract metadata from this conversation. Reply with ONLY valid JSON, no markdown, no explanation.

JSON format:
{"topic":"3-8 word topic","category":"Technical|Business|Education|Creative|Troubleshooting|Question|Research|Planning|Implementation|Review|Other","summary":"50-100 word summary","keywords":["kw1","kw2"],"entities":["entity1"],"importance_score":1}

importance_score: 1=casual, 2=simple question, 3=useful info, 4=project work, 5=highly valuable

Conversation:
${conversationText}`;

    try {
      logger.info(`DEBUG: [GROQ API CALL] Model: ${config.model}`);
      const response = await this.summaryClient.chat.completions.create({
        model:       config.model,
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  450,
        temperature: 0.1,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('Empty response from Groq');
      }

      return {
        content: response.choices[0].message.content,
        usage: {
          prompt_tokens:     response.usage?.prompt_tokens,
          completion_tokens: response.usage?.completion_tokens,
        },
      };
    } catch (error) {
      logger.error(`Groq API error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new GroqService();
