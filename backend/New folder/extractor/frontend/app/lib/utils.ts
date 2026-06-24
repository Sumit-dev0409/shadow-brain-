import { ChatSession, MemoryGraphData } from "@/app/types";

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Intent = "task" | "yesterday" | "idea" | "remind" | "default";

function classifyIntent(text: string): Intent {
  const lower = text.toLowerCase();
  if (lower.includes("task") || lower.includes("week") || lower.includes("to do")) return "task";
  if (lower.includes("yesterday") || lower.includes("working on") || lower.includes("resume")) return "yesterday";
  if (lower.includes("idea") || lower.includes("saved") || lower.includes("notes")) return "idea";
  if (lower.includes("remind") || lower.includes("deadline") || lower.includes("forget")) return "remind";
  return "default";
}

const RESPONSES: Record<Intent, string | string[]> = {
  task: `Based on your saved memory, here are your key tasks this week:\n\n• **Project Alpha deadline** — Friday, June 20\n• **Team sync call** — Wednesday at 3 PM\n• **Review design mockups** — Thursday morning\n• **Send Q3 report** — Friday EOD\n\nI noticed your Tuesday is open — a good window to tackle the Alpha deliverables.`,
  yesterday: `You were working on the **Q3 performance review presentation** yesterday. You had outlined 4 sections and completed 2.\n\nYou also saved a note: *"Check Sarah's data on user retention — she sent it via email."*\n\nWant me to pull up the full outline or draft the remaining sections?`,
  idea: `Here are your 5 most recently saved ideas:\n\n1. **Offline-first app concept** — sync when reconnected\n2. **Weekly memo format** — 3 bullets + 1 blocker\n3. **Reading habit tracker** using screen time data\n4. **Team retro template** you sketched Monday\n5. **AI journaling prompt** for end-of-day reflection\n\nWant to develop any of these further?`,
  remind: `Reminder set ✓\n\nI'll surface this before your deadline. I also noticed you're typically busy on Thursdays, so I'll flag it Wednesday evening too.\n\nShould I set a mid-point check-in so you can track your progress?`,
  default: [
    "I've stored that in your persistent memory. I'll surface it automatically when it becomes relevant to future conversations.",
    "Got it — indexed and organized. Based on your past notes, this connects to a few earlier threads. Want me to surface those?",
    "Memory updated. I noticed a pattern here that aligns with something you mentioned last week — should I draw the connection?",
    "Saved. You've been building toward this across several sessions. Want me to compile a full summary of what you've captured so far?",
    "That's now part of your long-term context. I'll cross-reference this with your other saved notes when it's useful.",
  ],
};

export function getAIResponse(text: string): string {
  const response = RESPONSES[classifyIntent(text)];
  if (Array.isArray(response)) return response[Math.floor(Math.random() * response.length)];
  return response;
}

/** Each graph mirrors what its matching response is actually talking about — node weight drives visual size and proximity to the core. */
const TASK_GRAPH: MemoryGraphData = {
  coreId: "core",
  nodes: [
    { id: "core", label: "This week's tasks", category: "core", weight: 1 },
    { id: "t1", label: "Project Alpha deadline", category: "task", weight: 1.6 },
    { id: "t2", label: "Send Q3 report", category: "task", weight: 1.3 },
    { id: "t3", label: "Review design mockups", category: "task", weight: 1.1 },
    { id: "t4", label: "Team sync call", category: "task", weight: 0.9 },
    { id: "s1", label: "Alpha sprint board", category: "note", weight: 0.5 },
    { id: "s2", label: "Engineering blocker", category: "note", weight: 0.45 },
    { id: "s3", label: "Offline-first app idea", category: "idea", weight: 0.55 },
    { id: "s4", label: "Friday EOD", category: "reminder", weight: 0.45 },
    { id: "s5", label: "Design mockups v3", category: "note", weight: 0.5 },
    { id: "s6", label: "Feedback from Sarah", category: "note", weight: 0.4 },
    { id: "s7", label: "Wed 3PM · Zoom", category: "reminder", weight: 0.4 },
  ],
  edges: [
    { source: "core", target: "t1" },
    { source: "core", target: "t2" },
    { source: "core", target: "t3" },
    { source: "core", target: "t4" },
    { source: "t1", target: "s1" },
    { source: "t1", target: "s2" },
    { source: "t1", target: "s3" },
    { source: "t2", target: "s4" },
    { source: "t3", target: "s5" },
    { source: "t3", target: "s6" },
    { source: "t4", target: "s7" },
  ],
};

const YESTERDAY_GRAPH: MemoryGraphData = {
  coreId: "core",
  nodes: [
    { id: "core", label: "Q3 performance review presentation", category: "core", weight: 1 },
    { id: "y1", label: "Market overview section", category: "note", weight: 1.2 },
    { id: "y2", label: "Metrics deep-dive section", category: "note", weight: 1.2 },
    { id: "y3", label: "Roadmap section (not started)", category: "note", weight: 0.8 },
    { id: "y4", label: "Wrap-up section (not started)", category: "note", weight: 0.8 },
    { id: "y5", label: "Sarah's retention data", category: "note", weight: 1.0 },
    { id: "z1", label: "User retention email", category: "note", weight: 0.45 },
    { id: "z2", label: "Add revenue slide", category: "task", weight: 0.5 },
    { id: "z3", label: "Q2 comparison chart", category: "idea", weight: 0.45 },
    { id: "z4", label: "Draft deck v2", category: "task", weight: 0.45 },
    { id: "z5", label: "Review with design team", category: "task", weight: 0.4 },
  ],
  edges: [
    { source: "core", target: "y1" },
    { source: "core", target: "y2" },
    { source: "core", target: "y3" },
    { source: "core", target: "y4" },
    { source: "core", target: "y5" },
    { source: "y5", target: "z1" },
    { source: "y1", target: "z2" },
    { source: "y2", target: "z3" },
    { source: "y3", target: "z4" },
    { source: "y4", target: "z5" },
  ],
};

const IDEA_GRAPH: MemoryGraphData = {
  coreId: "core",
  nodes: [
    { id: "core", label: "Recently saved ideas", category: "core", weight: 1 },
    { id: "i1", label: "Offline-first app concept", category: "idea", weight: 1.4 },
    { id: "i2", label: "Weekly memo format", category: "idea", weight: 1.0 },
    { id: "i3", label: "Reading habit tracker", category: "idea", weight: 1.0 },
    { id: "i4", label: "Team retro template", category: "idea", weight: 0.9 },
    { id: "i5", label: "AI journaling prompt", category: "idea", weight: 0.9 },
    { id: "n1", label: "Sync conflict resolution", category: "note", weight: 0.45 },
    { id: "t5", label: "Prototype this weekend", category: "task", weight: 0.55 },
    { id: "n3", label: "3 bullets + 1 blocker", category: "note", weight: 0.4 },
    { id: "n2", label: "Use screen-time API", category: "note", weight: 0.45 },
    { id: "n4", label: "Sketched Monday", category: "note", weight: 0.4 },
    { id: "r1", label: "Revisit in 2 weeks", category: "reminder", weight: 0.4 },
  ],
  edges: [
    { source: "core", target: "i1" },
    { source: "core", target: "i2" },
    { source: "core", target: "i3" },
    { source: "core", target: "i4" },
    { source: "core", target: "i5" },
    { source: "i1", target: "n1" },
    { source: "i1", target: "t5" },
    { source: "i2", target: "n3" },
    { source: "i3", target: "n2" },
    { source: "i4", target: "n4" },
    { source: "i5", target: "r1" },
  ],
};

const REMIND_GRAPH: MemoryGraphData = {
  coreId: "core",
  nodes: [
    { id: "core", label: "New reminder", category: "core", weight: 1 },
    { id: "rd1", label: "Project deadline", category: "reminder", weight: 1.5 },
    { id: "rd2", label: "Wed evening check-in", category: "reminder", weight: 1.0 },
    { id: "rd3", label: "Mid-point progress check", category: "reminder", weight: 0.8 },
    { id: "tk1", label: "Project Alpha", category: "task", weight: 0.55 },
    { id: "nt1", label: "Thursday is busy", category: "note", weight: 0.4 },
  ],
  edges: [
    { source: "core", target: "rd1" },
    { source: "core", target: "rd2" },
    { source: "core", target: "rd3" },
    { source: "rd1", target: "tk1" },
    { source: "rd2", target: "nt1" },
  ],
};

const MEMORY_GRAPHS: Partial<Record<Intent, MemoryGraphData>> = {
  task: TASK_GRAPH,
  yesterday: YESTERDAY_GRAPH,
  idea: IDEA_GRAPH,
  remind: REMIND_GRAPH,
};

/** Returns the memory graph backing an AI response, when that response actually has structured memory behind it. */
export function getMemoryGraph(text: string): MemoryGraphData | undefined {
  return MEMORY_GRAPHS[classifyIntent(text)];
}

export const INITIAL_SESSIONS: ChatSession[] = [
  {
    id: "s1",
    title: "Project deadline reminders",
    messages: [],
    createdAt: new Date(),
    lastMessageAt: new Date(),
  },
  {
    id: "s2",
    title: "Workout routine planning",
    messages: [],
    createdAt: new Date(Date.now() - 86400000),
    lastMessageAt: new Date(Date.now() - 86400000),
  },
  {
    id: "s3",
    title: "Book recommendations list",
    messages: [],
    createdAt: new Date(Date.now() - 86400000 * 2),
    lastMessageAt: new Date(Date.now() - 86400000 * 2),
  },
  {
    id: "s4",
    title: "Meeting notes — Q3 review",
    messages: [],
    createdAt: new Date(Date.now() - 86400000 * 3),
    lastMessageAt: new Date(Date.now() - 86400000 * 3),
  },
  {
    id: "s5",
    title: "Travel itinerary for Japan",
    messages: [],
    createdAt: new Date(Date.now() - 86400000 * 5),
    lastMessageAt: new Date(Date.now() - 86400000 * 5),
  },
  {
    id: "s6",
    title: "Recipe ideas for the week",
    messages: [],
    createdAt: new Date(Date.now() - 86400000 * 7),
    lastMessageAt: new Date(Date.now() - 86400000 * 7),
  },
];
