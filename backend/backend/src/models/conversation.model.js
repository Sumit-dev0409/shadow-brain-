const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: [
        'chatgpt', 'claude', 'gemini',
        'deepseek', 'blackbox', 'copilot', 'mscopilot',
        'perplexity', 'grok',
      ],
      lowercase: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    messages: [
      {
        role: String,
        content: String,
        timestamp: String,
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'],
      default: 'PENDING',
      index: true,
    },
    enrichment: {
      topic: String,
      category: String,
      summary: String,
      keywords: [String],
      entities: [String],
      importanceScore: Number,
      enrichedAt: Date,
      version: String,
      // messages.length at the time enrichment ran. Lets us tell a genuinely
      // up-to-date summary apart from one that's stale because the
      // conversation grew after it was last enriched.
      messageCountAtEnrichment: Number,
    },
    error: {
      type: String,
    },
    metadata: {
      topic: String,
      category: String,
      summary: String,
      keywords: [String],
      entities: [String],
      importance_score: Number,
      enriched_at: Date,
      enrichment_version: String,
      status: String,
      savedAtExtension: String,
      url: String,
    },
  },
  {
    timestamps: true,
  }
);

// IDs only need to be unique inside their source platform. The same opaque ID
// may legitimately be produced by two different providers.
conversationSchema.index({ platform: 1, externalId: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
