import { MemoryGraphData, MemoryNode, MemoryEdge, MemoryCategory } from "@/app/types";

/**
 * A static but richly-populated map of everything Shadow Brain "remembers."
 * Content deliberately echoes the canned responses + sidebar sessions elsewhere
 * in the app, so the graph reads as one continuous memory rather than a demo.
 */

const TASKS = [
  "Project Alpha deadline",
  "Team sync call",
  "Review design mockups",
  "Send Q3 report",
  "Sprint retro prep",
  "Budget approval",
  "Update roadmap deck",
  "File expense report",
  "QA pass for release",
  "Renew domain certs",
];

const IDEAS = [
  "Offline-first app concept",
  "Weekly memo format",
  "Reading habit tracker",
  "Team retro template",
  "AI journaling prompt",
  "Voice-note triage tool",
  "Async standup format",
  "Color-coded calendar idea",
];

const NOTES = [
  "Sarah's retention data",
  "Meeting notes — Q3 review",
  "Travel itinerary for Japan",
  "Recipe ideas for the week",
  "Book recommendations list",
  "Workout routine planning",
  "Vendor contract terms",
  "Onboarding feedback themes",
];

const REMINDERS = [
  "Wednesday team sync, 3 PM",
  "Thursday mockup review",
  "Friday EOD report",
  "Mid-point progress check-in",
  "Domain renewal — 30 days",
];

function buildPool(items: string[], category: MemoryCategory, weightRange: [number, number]): MemoryNode[] {
  return items.map((label, i) => ({
    id: `${category}-${i}`,
    label,
    category,
    weight: weightRange[0] + Math.random() * (weightRange[1] - weightRange[0]),
  }));
}

/**
 * Builds a fresh memory constellation centered on `topic`.
 * A handful of nodes per category connect directly to the core (the
 * "primary" recollections), the rest mesh together within their own cluster,
 * and a few cross-category links represent memories that bridge two threads.
 */
export function generateMemoryGraph(topic: string): MemoryGraphData {
  const core: MemoryNode = {
    id: "core",
    label: topic.length > 36 ? topic.slice(0, 33) + "…" : topic,
    category: "core",
    weight: 1,
  };

  const tasks = buildPool(TASKS, "task", [0.45, 0.9]);
  const ideas = buildPool(IDEAS, "idea", [0.4, 0.85]);
  const notes = buildPool(NOTES, "note", [0.4, 0.8]);
  const reminders = buildPool(REMINDERS, "reminder", [0.35, 0.75]);

  const nodes: MemoryNode[] = [core, ...tasks, ...ideas, ...notes, ...reminders];
  const edges: MemoryEdge[] = [];

  const clusters: MemoryNode[][] = [tasks, ideas, notes, reminders];

  clusters.forEach((cluster) => {
    // Core connects directly to the 2-3 heaviest ("primary") memories per cluster.
    const primaries = [...cluster].sort((a, b) => b.weight - a.weight).slice(0, 2 + Math.round(Math.random()));
    primaries.forEach((n) => edges.push({ source: "core", target: n.id }));

    // Within-cluster mesh: each node links to one or two cluster-mates.
    cluster.forEach((n, i) => {
      const linkCount = 1 + Math.round(Math.random());
      for (let k = 0; k < linkCount; k++) {
        const other = cluster[(i + 1 + k) % cluster.length];
        if (other.id !== n.id) edges.push({ source: n.id, target: other.id });
      }
    });
  });

  // A few cross-cluster bridges — memories that touch more than one thread.
  for (let i = 0; i < 5; i++) {
    const a = clusters[i % clusters.length][i % clusters[i % clusters.length].length];
    const b = clusters[(i + 1) % clusters.length][(i + 2) % clusters[(i + 1) % clusters.length].length];
    edges.push({ source: a.id, target: b.id });
  }

  return { coreId: "core", nodes, edges };
}
