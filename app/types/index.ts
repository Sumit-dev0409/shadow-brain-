export type MemoryCategory = "task" | "idea" | "note" | "reminder" | "core";

export interface MemoryNode {
  id: string;
  label: string;
  category: MemoryCategory;
  /** Relative importance — bigger nodes render larger and connect directly to the core. */
  weight: number;
}

export interface MemoryEdge {
  source: string;
  target: string;
}

export interface MemoryGraphData {
  /** The node id that anchors the graph (the current query/topic). */
  coreId: string;
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  graph?: MemoryGraphData;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  lastMessageAt: Date;
  // Fields populated from backend enrichment
  platform?: string;
  topic?: string;
  category?: string;
  keywords?: string[];
  summary?: string;
  importanceScore?: number;
  url?: string;
}
