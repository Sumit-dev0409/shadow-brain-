const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

function toApiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export async function passwordAuth(email: string, password: string, mode: 'login' | 'signup') {
  const res = await fetch(toApiUrl('/api/auth/password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, mode }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token || !data?.user?.email) {
    throw new Error(data?.message || `Authentication failed (${res.status})`);
  }
  return data as { token: string; user: { email: string; name?: string; avatar?: string } };
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
    const token = typeof window !== 'undefined' ? localStorage.getItem('shadowbrain_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(toApiUrl('/api/conversations?limit=500'), {
      headers
    });
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('shadowbrain_token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  console.log('[api.searchMemory] request', { url, query, platforms });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
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
  token: string;
  user: {
    email: string;
    name?: string;
    avatar?: string;
  };
}

export async function googleLogin(credential: string): Promise<GoogleAuthUser> {
  const res = await fetch(toApiUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential }),
  });
  const data = await res.json().catch(() => null);

  // ── STEP 1 (extended): Log the EXACT response from /api/auth/google ──
  console.log(`[JWT-STEP-1-EXT] ═══ Raw /api/auth/google response ═══`);
  console.log(`[JWT-STEP-1-EXT]   HTTP status: ${res.status} ${res.statusText}`);
  console.log(`[JWT-STEP-1-EXT]   Content-Type: ${res.headers.get('content-type')}`);
  console.log(`[JWT-STEP-1-EXT]   response.ok: ${res.ok}`);
  console.log(`[JWT-STEP-1-EXT]   body parsed: ${data !== null}`);
  console.log(`[JWT-STEP-1-EXT]   body keys: ${JSON.stringify(Object.keys(data || {}))}`);
  console.log(`[JWT-STEP-1-EXT]   body.full: ${JSON.stringify(data)?.slice(0, 500)}`);
  console.log(`[JWT-STEP-1-EXT]   has data.token: ${!!data?.token}`);
  console.log(`[JWT-STEP-1-EXT]   has data.user: ${!!data?.user}`);
  console.log(`[JWT-STEP-1-EXT]   has data.user.email: ${!!data?.user?.email}`);
  console.log(`[JWT-STEP-1-EXT]   data.token type: ${typeof data?.token}`);
  console.log(`[JWT-STEP-1-EXT]   data.token length: ${data?.token?.length ?? 0}`);
  console.log(`[JWT-STEP-1-EXT]   data.token preview: ${data?.token ? data.token.slice(0, 40) + '...' : 'N/A'}`);

  if (!res.ok) {
    const msg = data?.message || `Google sign-in failed (${res.status})`;
    console.error(`[JWT-STEP-1-EXT] ❌ FAIL — Backend returned error: ${msg}`);
    throw new Error(msg);
  }

  console.log(`[JWT-STEP-1-EXT]   ─── Branch analysis ───`);

  // Backend may return { token, user } or just { email, name, avatar } (cookie-only).
  if (data?.user?.email && data?.token) {
    console.log(`[JWT-STEP-1-EXT] ✅ Branch A: data.user.email="${data.user.email}", data.token.length=${data.token.length}`);
    return { token: data.token, user: data.user };
  }
  if (data?.user?.email && !data?.token) {
    console.warn(`[JWT-STEP-1-EXT] ⚠️ Branch B: data.user.email present but NO data.token — falling through to /me`);
  }
  if (data?.email && data?.token) {
    console.log(`[JWT-STEP-1-EXT] ✅ Branch C: data.email="${data.email}", data.token.length=${data.token.length}`);
    return { token: data.token, user: { email: data.email, name: data.name, avatar: data.avatar } };
  }

  // Fallback: backend set an httpOnly cookie but didn't return the token in the body.
  // Recover it via /api/auth/me which reads the cookie and now returns { token, ... }.
  console.warn(`[JWT-STEP-1-EXT] ⚠️ No token in body. Trying /api/auth/me fallback...`);
  const meRes = await fetch(toApiUrl('/api/auth/me'), { credentials: 'include' });
  const meBody = await meRes.json().catch(() => null);
  console.log(`[JWT-STEP-1-EXT]   /api/auth/me status: ${meRes.status}`);
  console.log(`[JWT-STEP-1-EXT]   /api/auth/me body: ${JSON.stringify(meBody)?.slice(0, 300)}`);
  console.log(`[JWT-STEP-1-EXT]   /api/auth/me hasToken: ${!!meBody?.token}`);
  if (meRes.ok && meBody?.token) {
    const email = meBody.email || data?.email || '';
    const name = meBody.name || data?.name;
    const avatar = meBody.avatar || data?.avatar;
    console.log(`[JWT-STEP-1-EXT] ✅ Token recovered via /me, token.length=${meBody.token.length}`);
    return { token: meBody.token, user: { email, name, avatar } };
  }

  // Last resort: return what we have (extension sync will fail, but login won't crash).
  const email = data?.email || data?.user?.email || '';
  const name = data?.name || data?.user?.name;
  const avatar = data?.avatar || data?.user?.avatar;
  console.error(`[JWT-STEP-1-EXT] ❌ LAST RESORT: no token from body OR /me. Returning empty token.`);
  console.error(`[JWT-STEP-1-EXT]   email=${email}, name=${name}`);
  console.error(`[JWT-STEP-1-EXT]   This will cause setSession() to REMOVE the localStorage key`);
  console.error(`[JWT-STEP-1-EXT]   The extension bridge will have no token to send`);
  if (!email) throw new Error(`Unexpected server response: ${JSON.stringify(data)}`);
  return { token: '', user: { email, name, avatar } };
}

export async function saveConversation(data: {
  external_id: string;
  platform: string;
  title: string;
  messages: ApiMessage[];
}): Promise<void> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('shadowbrain_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(toApiUrl('/api/import/capture'), {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  } catch {
    // fire-and-forget — don't block the UI
  }
}
