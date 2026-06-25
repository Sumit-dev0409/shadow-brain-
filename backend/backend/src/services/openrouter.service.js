const OpenAI = require('openai');
const config = require('../config/openrouter');
const logger = require('../utils/logger');

class OpenRouterService {
  constructor() {
    this.client = new OpenAI({
      apiKey:   config.openrouter.apiKey,
      baseURL:  config.openrouter.baseUrl,
      timeout:  30000,
      defaultHeaders: {
        'HTTP-Referer': 'https://brain-shadow.local',
        'X-Title':      'Brain Shadow',
      },
    });
  }

  // ── Chat: general-purpose multi-turn conversation ─────────
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

    const response = await this.client.chat.completions.create({
      model:       config.openrouter.model,
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
    const prompt = `You are an AI metadata extraction engine. Analyze the conversation and generate structured metadata that will help with future search, categorization, memory recall, semantic retrieval, and knowledge management.

Requirements:
- Create a concise topic (3-8 words).
- Create a detailed summary (50-150 words).
- Extract 5-15 highly relevant keywords.
- Identify the primary category.
- Identify important technologies, tools, frameworks, platforms, companies, and concepts.
- Ignore greetings, filler text, and small talk.
- Focus on intent, problem, solution, implementation details, and key learnings.
- Return valid JSON only.
- Do not return markdown.
- Do not return explanations.
- Do not wrap JSON inside code blocks.

Categories: Technical, Business, Education, Creative, Troubleshooting, Question, Research, Planning, Implementation, Review, Other

Importance Scale:
1 = casual conversation
2 = simple question
3 = useful information
4 = project/work related
5 = highly valuable knowledge or implementation details

Return ONLY this JSON structure (no markdown, no code blocks, no explanations):

{
  "topic": "string (3-8 words)",
  "category": "string (one of: Technical, Business, Education, Creative, Troubleshooting, Question, Research, Planning, Implementation, Review, Other)",
  "summary": "string (50-150 words)",
  "keywords": ["keyword1", "keyword2", ...],
  "entities": ["entity1", "entity2", ...],
  "importance_score": number (1-5)
}

Conversation:
${conversationText}`;

    try {
      logger.info(`DEBUG: [OPENROUTER API CALL] Model: ${config.openrouter.model}`);
      const response = await this.client.chat.completions.create({
        model:       config.openrouter.model,
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  450,
        temperature: 0.1,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('Empty response from OpenRouter');
      }

      return {
        content: response.choices[0].message.content,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens,
          completion_tokens: response.usage?.completion_tokens,
        }
      };
    } catch (error) {
      logger.error(`OpenRouter API error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new OpenRouterService();
