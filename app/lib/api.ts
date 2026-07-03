const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ApiEnrichment {
  topic?: string;
  category?: string;
  summary?: string;
  keywords?: string[];
  entities?: string[];
  importanceScore?: number;
  enrichedAt?: string;
  version?: string;
}

export interface ApiConversation {
  _id: string;
  title: string;
  platform: string;
  externalId: string;
  status: string;
  messages: Array<{ role: string; content: string; timestamp: string; _id?: string }>;
  enrichment?: ApiEnrichment;
  metadata?: {
    url?: string;
    savedAtExtension?: string;
    topic?: string;
    category?: string;
    summary?: string;
    keywords?: string[];
    importance_score?: number;
  };
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function sendChatMessage(
  messages: ApiMessage[],
  systemPrompt?: string,
): Promise<{ content: string }> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt }),
  });
  if (!res.ok) throw new Error(`Chat error ${res.status}`);
  return res.json();
}

export async function fetchConversations(): Promise<ApiConversation[]> {
  try {
    const res = await fetch(`${API_BASE}/api/conversations?limit=500`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export interface MemorySource {
  id: string;
  convId?: string;
  title: string;
  platform: string;
  date?: string | null;
  role?: string;
  snippet?: string;
  summary?: string | null;
  keywords?: string[];
}

export async function searchMemory(query: string, platforms?: string[]): Promise<{ answer: string; sources: MemorySource[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/conversations/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, platforms: platforms && platforms.length > 0 ? platforms : undefined }),
    });
    if (!res.ok) throw new Error(`Search error ${res.status}`);
    return res.json();
  } catch (e) {
    const isNetworkError = e instanceof TypeError;
    return {
      answer: isNetworkError
        ? 'Could not reach the backend. Make sure it is running on port 8000.'
        : `Search failed: ${(e as Error).message}`,
      sources: [],
    };
  }
}

export async function saveConversation(data: {
  external_id: string;
  platform: string;
  title: string;
  messages: ApiMessage[];
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/import/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // fire-and-forget — don't block the UI
  }
}
