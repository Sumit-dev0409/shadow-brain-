export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  lastMessageAt: Date;
  // Brain Shadow fields
  platform?: string;
  externalId?: string;
  url?: string;
  topic?: string;
  summary?: string;
  importanceScore?: number;
  isFromBackend?: boolean;
}

// Raw shape returned by GET /api/conversations
export interface BackendConversation {
  _id: string;
  externalId: string;
  platform: string;
  title: string;
  status: string;
  messages: Array<{
    _id?: string;
    role: string;
    content: string;
    timestamp: string;
  }>;
  metadata?: {
    topic?: string;
    summary?: string;
    importance_score?: number;
    category?: string;
    keywords?: string;
    url?: string;
  };
  createdAt: string;
  updatedAt: string;
}
