module.exports = {
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct', // Match original default
  },
  rateLimit: {
    perMinute: 20,
  },
  retry: {
    maxRetries: 3,
    delayMs: 2000,
    backoffMultiplier: 2,
    maxBackoffMs: 30000,
  },
  request: {
    timeoutMs: 60000,
  },
};
