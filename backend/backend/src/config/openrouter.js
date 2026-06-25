// Supports both Groq (default, free 14400 req/day) and OpenRouter
// Set AI_PROVIDER=openrouter in .env to switch back to OpenRouter

const provider = process.env.AI_PROVIDER || 'groq';

const providers = {
  groq: {
    apiKey:  process.env.GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1',
    model:   process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  openrouter: {
    apiKey:  process.env.OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    model:   process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free',
  },
};

module.exports = {
  openrouter: providers[provider] || providers.groq,
  rateLimit: { perMinute: 20 },
  retry:     { maxRetries: 3, delayMs: 2000, backoffMultiplier: 2, maxBackoffMs: 30000 },
  request:   { timeoutMs: 60000 },
};
