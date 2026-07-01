import mongoose, { Schema, Model } from 'mongoose';

export interface IMessage {
  _id?: string;
  role: string;
  content: string;
  timestamp: string;
}

export interface IConversation {
  _id: string;
  externalId: string;
  platform: string;
  title?: string;
  messages: IMessage[];
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
  enrichment?: {
    topic?: string;
    category?: string;
    summary?: string;
    keywords?: string[];
    entities?: string[];
    importanceScore?: number;
    enrichedAt?: Date;
    version?: string;
  };
  metadata?: {
    topic?: string;
    category?: string;
    summary?: string;
    keywords?: string[];
    entities?: string[];
    importance_score?: number;
    enriched_at?: Date;
    enrichment_version?: string;
    status?: string;
    savedAtExtension?: string;
    url?: string;
  };
  createdAt: string;
  updatedAt: string;
}

const messageSchema = new Schema({
  role:      { type: String },
  content:   { type: String },
  timestamp: { type: String },
});

const conversationSchema = new Schema<IConversation>(
  {
    externalId: { type: String, required: true, index: true },
    platform: {
      type: String,
      required: true,
      enum: ['chatgpt', 'claude', 'gemini', 'deepseek', 'blackbox', 'copilot', 'mscopilot', 'perplexity', 'grok'],
    },
    title:    { type: String, trim: true },
    messages: [messageSchema],
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'],
      default: 'PENDING',
      index: true,
    },
    enrichment: {
      topic:          String,
      category:       String,
      summary:        String,
      keywords:       [String],
      entities:       [String],
      importanceScore: Number,
      enrichedAt:     Date,
      version:        String,
    },
    metadata: {
      topic:               String,
      category:            String,
      summary:             String,
      keywords:            [String],
      entities:            [String],
      importance_score:    Number,
      enriched_at:         Date,
      enrichment_version:  String,
      status:              String,
      savedAtExtension:    String,
      url:                 String,
    },
  },
  { timestamps: true }
);

conversationSchema.index({ platform: 1, externalId: 1 }, { unique: true });

export const Conversation: Model<IConversation> =
  (mongoose.models.Conversation as Model<IConversation>) ||
  mongoose.model<IConversation>('Conversation', conversationSchema);
