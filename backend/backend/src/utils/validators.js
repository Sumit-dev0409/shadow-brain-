/**
 * Migrated from original validators.js
 */

const METADATA_SCHEMA = {
  type: 'object',
  required: ['topic', 'category', 'summary', 'keywords', 'entities', 'importance_score'],
  properties: {
    topic: { type: 'string', minLength: 1, maxLength: 200 },
    category: {
      type: 'string',
      enum: ['Technical', 'Business', 'Education', 'Creative', 'Troubleshooting', 'Question', 'Research', 'Planning', 'Implementation', 'Review', 'Other']
    },
    summary: { type: 'string', minLength: 10, maxLength: 1000 },
    keywords: { type: 'array', minItems: 1, items: { type: 'string' } },
    entities: { type: 'array', items: { type: 'string' } },
    importance_score: { type: 'number', minimum: 1, maximum: 5 }
  }
};

function validateMetadata(metadata) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object') return { valid: false, errors: ['Not an object'] };
  
  for (const field of METADATA_SCHEMA.required) {
    if (!(field in metadata)) errors.push(`Missing ${field}`);
  }

  return { valid: errors.length === 0, errors };
}

function parseJsonResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '');
  else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '').replace(/```$/, '');
  
  try {
    return JSON.parse(cleaned.trim());
  } catch (e) {
    throw new Error('Failed to parse AI JSON response');
  }
}

function cleanConversationText(text) {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ').slice(0, 10000); // 10k limit
}

module.exports = {
  METADATA_SCHEMA,
  validateMetadata,
  parseJsonResponse,
  cleanConversationText
};
