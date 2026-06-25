const VALID_CATEGORIES = [
  'Technical', 'Business', 'Education', 'Creative',
  'Troubleshooting', 'Question', 'Research', 'Planning',
  'Implementation', 'Review', 'Other',
];

// Fill in sensible defaults for any missing/invalid fields
// so enrichment never fails due to incomplete AI response
function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return { valid: false, errors: ['Not an object'] };
  }

  if (!metadata.topic || typeof metadata.topic !== 'string') {
    metadata.topic = 'General Conversation';
  }

  if (!VALID_CATEGORIES.includes(metadata.category)) {
    metadata.category = 'Other';
  }

  if (!metadata.summary || typeof metadata.summary !== 'string' || metadata.summary.length < 5) {
    metadata.summary = metadata.topic;
  }

  if (!Array.isArray(metadata.keywords) || metadata.keywords.length === 0) {
    metadata.keywords = [metadata.topic];
  }

  if (!Array.isArray(metadata.entities)) {
    metadata.entities = [];
  }

  const score = Number(metadata.importance_score);
  if (!score || score < 1 || score > 5) {
    metadata.importance_score = 3;
  } else {
    metadata.importance_score = score;
  }

  return { valid: true, errors: [] };
}

function parseJsonResponse(text) {
  if (!text) throw new Error('Empty AI response');

  // 1. Direct parse
  try { return JSON.parse(text.trim()); } catch (_) {}

  // 2. Extract from code fence anywhere in the response
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }

  // 3. Extract first {...} block
  const braceStart = text.indexOf('{');
  const braceEnd   = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(text.slice(braceStart, braceEnd + 1)); } catch (_) {}
  }

  throw new Error('Failed to parse AI JSON response');
}

function cleanConversationText(text) {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ').slice(0, 10000);
}

module.exports = {
  validateMetadata,
  parseJsonResponse,
  cleanConversationText,
};
