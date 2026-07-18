module.exports = {
  // Two separate Groq keys split by workload so summarization (enrichment)
  // and search-answer generation (chat) each get their own 14,400 req/day
  // quota instead of sharing one. Both fall back to GROQ_API_KEY if their
  // specific var isn't set, so a single-key setup keeps working unchanged.
  apiKeySummary: process.env.GROQ_API_KEY_SUMMARY || process.env.GROQ_API_KEY,
  apiKeyChat:    process.env.GROQ_API_KEY_CHAT    || process.env.GROQ_API_KEY,
  baseUrl: 'https://api.groq.com/openai/v1',
  model:   process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
};
