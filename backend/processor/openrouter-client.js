const OpenAI = require('openai');
const config = require('./config');

/**
 * OpenRouter API Client with retry logic and rate limiting
 */
class OpenRouterClient {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.openrouter.apiKey,
      baseURL: config.openrouter.baseUrl,
      defaultHeaders: {
        'HTTP-Referer': 'https://brain-shadow.local',
        'X-Title': 'Brain Shadow',
      },
    });

    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.requestCountResetTime = Date.now();
  }

  /**
   * Get minimum delay between requests based on rate limit
   * @returns {number} Delay in milliseconds
   */
  getMinDelayBetweenRequests() {
    return (60 * 1000) / config.rateLimit.perMinute;
  }

  /**
   * Check and enforce rate limiting
   */
  async enforceRateLimit() {
    const now = Date.now();

    // Reset counter every minute
    if (now - this.requestCountResetTime > 60 * 1000) {
      this.requestCount = 0;
      this.requestCountResetTime = now;
    }

    // If at limit, wait
    if (this.requestCount >= config.rateLimit.perMinute) {
      const timeUntilReset = 60 * 1000 - (now - this.requestCountResetTime);
      console.log(`⏳ Rate limit reached. Waiting ${Math.ceil(timeUntilReset / 1000)}s...`);
      await this.sleep(timeUntilReset);
      this.requestCount = 0;
      this.requestCountResetTime = Date.now();
    }

    // Enforce minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minDelay = this.getMinDelayBetweenRequests();

    if (timeSinceLastRequest < minDelay) {
      await this.sleep(minDelay - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Exponential backoff calculator
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  calculateBackoff(attempt) {
    const delay = config.retry.delayMs * Math.pow(config.retry.backoffMultiplier, attempt);
    return Math.min(delay, config.retry.maxBackoffMs);
  }

  /**
   * Extract metadata from conversation using OpenRouter API
   * @param {string} conversationText - Full conversation text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Metadata object
   */
  async extractMetadata(conversationText, options = {}) {
    const prompt = config.metadataPrompt.replace('{{CHAT_CONTENT}}', conversationText);

    for (let attempt = 0; attempt <= config.retry.maxRetries; attempt++) {
      try {
        // Enforce rate limiting
        await this.enforceRateLimit();

        console.log(`📤 Sending request to OpenRouter (attempt ${attempt + 1})`);

        const response = await this.client.chat.completions.create(
          {
            model: config.openrouter.model,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 1024,
            temperature: 0.7,
          },
          {
            timeout: config.request.timeoutMs,
          }
        );

        if (!response.choices || response.choices.length === 0) {
  throw new Error('Empty response from API');
}

return {
  success: true,
  metadata: response.choices[0].message.content,
  tokens: {
    input: response.usage?.prompt_tokens || 0,
    output: response.usage?.completion_tokens || 0,
  },
};
      } catch (error) {
        const isLastAttempt = attempt === config.retry.maxRetries;
        const backoffMs = this.calculateBackoff(attempt);

        console.error(`❌ Request failed (attempt ${attempt + 1}):`, error.message);

        if (isLastAttempt) {
          throw new Error(
            `Failed to extract metadata after ${config.retry.maxRetries + 1} attempts: ${error.message}`
          );
        }

        console.log(`⏳ Retrying in ${backoffMs}ms...`);
        await this.sleep(backoffMs);
      }
    }
  }

  /**
   * Batch extract metadata for multiple conversations
   * @param {Array<string>} conversations - Array of conversation texts
   * @param {Function} onProgress - Progress callback (current, total)
   * @returns {Promise<Array<Object>>} Array of results
   */
  async batchExtractMetadata(conversations, onProgress = null) {
    const results = [];

    for (let i = 0; i < conversations.length; i++) {
      try {
        const metadata = await this.extractMetadata(conversations[i]);
        results.push({
          success: true,
          metadata,
        });

        if (onProgress) {
          onProgress(i + 1, conversations.length);
        }
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
        });

        if (onProgress) {
          onProgress(i + 1, conversations.length);
        }
      }
    }

    return results;
  }
}

module.exports = OpenRouterClient;
