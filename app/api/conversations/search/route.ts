import { NextRequest } from 'next/server';

const BACKEND = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://shadow-brain-u4ua.onrender.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const authorization = request.headers.get('authorization');
    const cookie = request.headers.get('cookie');
    if (authorization) headers.set('authorization', authorization);
    if (cookie) headers.set('cookie', cookie);

    const res = await fetch(`${BACKEND}/api/conversations/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const text = await res.text();

    if (!res.ok) {
      return Response.json(
        { answer: text || 'Search failed', sources: [] },
        { status: res.status }
      );
    }

    try {
      return Response.json(JSON.parse(text));
    } catch {
      return Response.json({ answer: text, sources: [] });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg, answer: 'Search could not be completed right now.', sources: [] }, { status: 503 });
  }
}
