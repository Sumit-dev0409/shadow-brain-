/**
 * JSON Schema Validators for metadata enrichment
 */

const METADATA_SCHEMA = {
  type: 'object',
  required: ['topic', 'category', 'summary', 'keywords', 'entities', 'importance_score'],
  properties: {
    topic: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
    },
    category: {
      type: 'string',
      enum: [
        'Technical',
        'Business',
        'Education',
        'Creative',
        'Troubleshooting',
        'Question',
        'Research',
        'Planning',
        'Implementation',
        'Review',
        'Other',
      ],
    },
    summary: {
      type: 'string',
      minLength: 10,
      maxLength: 1000,
    },
    keywords: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
      },
    },
    entities: {
      type: 'array',
      minItems: 0,
      maxItems: 30,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
      },
    },
    importance_score: {
      type: 'number',
      minimum: 1,
      maximum: 5,
      multipleOf: 1,
    },
  },
};

/**
 * Validate metadata against schema
 * @param {Object} metadata - Metadata object to validate
 * @param {Object} schema - JSON schema to validate against
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateMetadata(metadata, schema = METADATA_SCHEMA) {
  const errors = [];

  // Check if metadata is an object
  if (typeof metadata !== 'object' || metadata === null) {
    return {
      valid: false,
      errors: ['Metadata must be a valid JSON object'],
    };
  }

  // Check required fields
  for (const required of schema.required) {
    if (!(required in metadata)) {
      errors.push(`Missing required field: '${required}'`);
    }
  }

  // Validate each property
  for (const [key, constraint] of Object.entries(schema.properties)) {
    if (!(key in metadata)) continue;

    const value = metadata[key];

    // Type check
    if (constraint.type === 'string' && typeof value !== 'string') {
      errors.push(`Field '${key}' must be a string, got ${typeof value}`);
      continue;
    }

    if (constraint.type === 'number' && typeof value !== 'number') {
      errors.push(`Field '${key}' must be a number, got ${typeof value}`);
      continue;
    }

    if (constraint.type === 'array' && !Array.isArray(value)) {
      errors.push(`Field '${key}' must be an array, got ${typeof value}`);
      continue;
    }

    // String constraints
    if (constraint.type === 'string') {
      if (constraint.minLength && value.length < constraint.minLength) {
        errors.push(`Field '${key}' must be at least ${constraint.minLength} characters`);
      }
      if (constraint.maxLength && value.length > constraint.maxLength) {
        errors.push(`Field '${key}' must be at most ${constraint.maxLength} characters`);
      }
      if (constraint.enum && !constraint.enum.includes(value)) {
        errors.push(
          `Field '${key}' must be one of: ${constraint.enum.join(', ')}, got '${value}'`
        );
      }
    }

    // Number constraints
    if (constraint.type === 'number') {
      if (constraint.minimum !== undefined && value < constraint.minimum) {
        errors.push(`Field '${key}' must be >= ${constraint.minimum}`);
      }
      if (constraint.maximum !== undefined && value > constraint.maximum) {
        errors.push(`Field '${key}' must be <= ${constraint.maximum}`);
      }
      if (constraint.multipleOf && value % constraint.multipleOf !== 0) {
        errors.push(`Field '${key}' must be a multiple of ${constraint.multipleOf}`);
      }
    }

    // Array constraints
    if (constraint.type === 'array') {
      if (constraint.minItems && value.length < constraint.minItems) {
        errors.push(
          `Field '${key}' must have at least ${constraint.minItems} items`
        );
      }
      if (constraint.maxItems && value.length > constraint.maxItems) {
        errors.push(`Field '${key}' must have at most ${constraint.maxItems} items`);
      }

      // Validate array items
      if (constraint.items) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (constraint.items.type === 'string' && typeof item !== 'string') {
            errors.push(`Field '${key}[${i}]' must be a string, got ${typeof item}`);
          } else if (constraint.items.minLength && item.length < constraint.items.minLength) {
            errors.push(
              `Field '${key}[${i}]' must be at least ${constraint.items.minLength} characters`
            );
          } else if (constraint.items.maxLength && item.length > constraint.items.maxLength) {
            errors.push(
              `Field '${key}[${i}]' must be at most ${constraint.items.maxLength} characters`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse JSON response from API, handling various formats
 * @param {string} text - Raw text response from API
 * @returns {Object} Parsed JSON object
 * @throws {Error} If JSON cannot be parsed
 */
function parseJsonResponse(text) {
  // Remove markdown code block markers if present
  let cleaned = text.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response: ${error.message}\nResponse: ${text.substring(0, 200)}`
    );
  }
}

/**
 * Clean conversation text for processing
 * @param {string} text - Raw conversation text
 * @returns {string} Cleaned text
 */
function cleanConversationText(text) {
  if (!text) return '';

  return text
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, 8000); // Cap at 8000 chars to avoid token limits
}

module.exports = {
  METADATA_SCHEMA,
  validateMetadata,
  parseJsonResponse,
  cleanConversationText,
};
