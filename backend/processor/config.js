require('dotenv').config();

const config = {
  // OpenRouter API Configuration
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct',
  },

  // Retry & Rate Limiting
  retry: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    delayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
    backoffMultiplier: 1.5,
    maxBackoffMs: 30000,
  },

  // Rate Limiting
  rateLimit: {
    perMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '20', 10),
    batchSize: parseInt(process.env.BATCH_SIZE || '5', 10),
  },

  // Request Configuration
  request: {
    timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
  },

  // File Paths
  paths: {
    inputDir: process.env.INPUT_DIR || './input',
    outputDir: process.env.OUTPUT_DIR || './output',
    inputFile: process.env.INPUT_FILE || 'brain-shadow-export-2026-06-16.json',
    outputFile: process.env.OUTPUT_FILE || 'enriched.json',
    logDir: process.env.LOG_DIR || './logs',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    toFile: process.env.LOG_TO_FILE === 'true',
  },

  // Prompt Template
  metadataPrompt: `You are an AI metadata extraction engine. Analyze the conversation and generate structured metadata that will help with future search, categorization, memory recall, semantic retrieval, and knowledge management.

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
{{CHAT_CONTENT}}`,
};

// Validation
if (!config.openrouter.apiKey) {
  throw new Error(
    'OPENROUTER_API_KEY is not set. Please create a .env file with your API key.'
  );
}

module.exports = config;
