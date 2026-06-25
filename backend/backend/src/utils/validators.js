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
  if (!text) throw new Error('Empty AI response');

  // 1. Try direct parse first (model obeyed instructions)
  try { return JSON.parse(text.trim()); } catch (_) {}

  // 2. Extract from code fence anywhere in the response
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }

  // 3. Extract the first {...} block (handles "Here is the JSON: {...}")
  const braceStart = text.indexOf('{');
  const braceEnd   = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(text.slice(braceStart, braceEnd + 1)); } catch (_) {}
  }

  throw new Error('Failed to parse AI JSON response');
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
