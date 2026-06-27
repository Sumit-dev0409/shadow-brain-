module.exports = {
  apiKey:  process.env.GROQ_API_KEY,
  baseUrl: 'https://api.groq.com/openai/v1',
  model:   process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
};
