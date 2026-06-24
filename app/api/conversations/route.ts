import { NextRequest } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Conversation } from '@/app/lib/models/conversation';

// GET /api/conversations — queries MongoDB directly
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const platform = searchParams.get('platform');
    const limit    = parseInt(searchParams.get('limit') || '50', 10);
    const page     = parseInt(searchParams.get('page')  || '1',  10);
    const skip     = (page - 1) * limit;

    const filter: Record<string, string> = {};
    if (platform) filter.platform = platform;

    const conversations = await Conversation
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return Response.json(conversations);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
