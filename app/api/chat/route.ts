import { NextRequest } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'https://shadow-brain-u4ua.onrender.com';

// POST /api/chat — proxies to backend /api/chat (OpenRouter)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${BACKEND}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return Response.json(err, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 503 });
  }
}
