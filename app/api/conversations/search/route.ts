import { NextRequest } from 'next/server';

const BACKEND = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${BACKEND}/api/conversations/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
