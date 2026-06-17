import { Message } from "@/app/types";

const BACKEND_URL = "http://localhost:8000";

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function formatTime(date: Date): string {
  const now  = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Calls the Brain Shadow backend which forwards to OpenRouter
export async function getAIResponse(
  text: string,
  history: Message[]
): Promise<string> {
  try {
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ messages }),
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
    return `Backend offline or error: ${msg}\n\nStart it with:\n\`cd backend/server && npm install && node index.js\``;
  }
}

export const INITIAL_SESSIONS = [
  {
    id:            "s1",
    title:         "Project deadline reminders",
    messages:      [] as Message[],
    createdAt:     new Date(),
    lastMessageAt: new Date(),
  },
  {
    id:            "s2",
    title:         "Workout routine planning",
    messages:      [] as Message[],
    createdAt:     new Date(Date.now() - 86400000),
    lastMessageAt: new Date(Date.now() - 86400000),
  },
  {
    id:            "s3",
    title:         "Book recommendations list",
    messages:      [] as Message[],
    createdAt:     new Date(Date.now() - 86400000 * 2),
    lastMessageAt: new Date(Date.now() - 86400000 * 2),
  },
  {
    id:            "s4",
    title:         "Meeting notes — Q3 review",
    messages:      [] as Message[],
    createdAt:     new Date(Date.now() - 86400000 * 3),
    lastMessageAt: new Date(Date.now() - 86400000 * 3),
  },
  {
    id:            "s5",
    title:         "Travel itinerary for Japan",
    messages:      [] as Message[],
    createdAt:     new Date(Date.now() - 86400000 * 5),
    lastMessageAt: new Date(Date.now() - 86400000 * 5),
  },
  {
    id:            "s6",
    title:         "Recipe ideas for the week",
    messages:      [] as Message[],
    createdAt:     new Date(Date.now() - 86400000 * 7),
    lastMessageAt: new Date(Date.now() - 86400000 * 7),
  },
];
