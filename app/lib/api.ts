const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

function toApiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

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
  const res = await fetch(toApiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemPrompt }),
  });
  if (!res.ok) throw new Error(`Chat error ${res.status}`);
  return res.json();
}

export async function fetchConversations(): Promise<ApiConversation[]> {
  try {
    const res = await fetch(toApiUrl('/api/conversations?limit=500'));
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
  const url = toApiUrl('/api/conversations/search');
  console.log('[api.searchMemory] request', { url, query, platforms });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, platforms: platforms && platforms.length > 0 ? platforms : undefined }),
    });
    console.log('[api.searchMemory] response status', { status: res.status, statusText: res.statusText });
    const data = await res.json().catch((parseError) => {
      console.error('[api.searchMemory] failed to parse JSON', parseError);
      throw parseError;
    });
    console.log('[api.searchMemory] parsed response', data);
    if (!res.ok) throw new Error(`Search error ${res.status}`);
    return data;
  } catch (e) {
    console.error('[api.searchMemory] error', e);
    const isNetworkError = e instanceof TypeError;
    return {
      answer: isNetworkError
        ? 'Could not reach the backend. Make sure it is running on port 8000.'
        : `Search failed: ${(e as Error).message}`,
      sources: [],
    };
  }
}

export interface GoogleAuthUser {
  email: string;
  name?: string;
  avatar?: string;
}

export async function googleLogin(credential: string): Promise<GoogleAuthUser> {
  const res = await fetch(toApiUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error('Google sign-in failed');
  return res.json();
}

export async function saveConversation(data: {
  external_id: string;
  platform: string;
  title: string;
  messages: ApiMessage[];
}): Promise<void> {
  try {
    await fetch(toApiUrl('/api/import/capture'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    // fire-and-forget — don't block the UI
  }
}
