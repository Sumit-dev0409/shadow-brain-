import { Message, ChatSession, BackendConversation } from "@/app/types";

// ── ID helper ──────────────────────────────────────────────
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Time formatter ─────────────────────────────────────────
export function formatTime(date: Date): string {
  const now  = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Platform emoji helper ──────────────────────────────────
export function platformEmoji(platform?: string): string {
  const map: Record<string, string> = {
    chatgpt:    "🤖",
    claude:     "🧠",
    gemini:     "✨",
    deepseek:   "⬡",
    blackbox:   "■",
    copilot:    "🪟",
    mscopilot:  "🪟",
    perplexity: "🔍",
    grok:       "𝕏",
  };
  return map[platform?.toLowerCase() || ""] || "💬";
}

// ── Convert backend conversation → ChatSession ─────────────
export function toSession(conv: BackendConversation): ChatSession {
  const messages: Message[] = (conv.messages || []).map((m, i) => ({
    id:        m._id || generateId(),
    role:      (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content:   m.content || "",
    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
  }));

  const lastMsg = messages[messages.length - 1];

  return {
    id:              conv._id,
    title:           conv.title || conv.metadata?.topic || "Untitled",
    messages,
    createdAt:       new Date(conv.createdAt),
    lastMessageAt:   lastMsg?.timestamp || new Date(conv.updatedAt || conv.createdAt),
    platform:        conv.platform,
    externalId:      conv.externalId,
    url:             conv.metadata?.url,
    topic:           conv.metadata?.topic,
    summary:         conv.metadata?.summary,
    importanceScore: conv.metadata?.importance_score,
    isFromBackend:   true,
  };
}

// ── Fetch conversations from backend (via Next.js proxy) ───
export async function fetchConversations(platform?: string): Promise<ChatSession[]> {
  try {
    const params = new URLSearchParams({ limit: "100" });
    if (platform) params.set("platform", platform);

    const res = await fetch(`/api/conversations?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const conversations: BackendConversation[] = await res.json();
    return conversations
      .map(toSession)
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  } catch (err) {
    console.error("[Brain Shadow] fetchConversations failed:", err);
    return [];
  }
}

// ── AI chat via backend → OpenRouter ──────────────────────
export async function getAIResponse(
  text: string,
  history: Message[],
  systemPrompt?: string
): Promise<string> {
  try {
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    const res = await fetch("/api/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ messages, systemPrompt }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }

    const data = await res.json();
    return data.content || "No response from AI.";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Brain Shadow] Chat error:", msg);
    return `⚠️ Backend offline or error: ${msg}\n\nMake sure the backend is running:\n\`cd backend/backend && node src/server.js\``;
  }
}
