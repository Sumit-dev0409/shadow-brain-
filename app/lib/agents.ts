export interface AgentOption {
  id: string;
  name: string;
  description: string;
  accent: string;
}

// Single source of truth for AI agent branding — colors match the Shadow Brain
// dark theme spec (ChatGPT=Emerald, Gemini=Royal Blue, Claude=Orange,
// DeepSeek=Purple, Perplexity=Cyan, Grok=Red, Blackbox=Yellow). Copilot isn't
// part of that spec but is a real supported platform, so it gets its own
// non-conflicting accent (sky blue).
export const AI_AGENTS: AgentOption[] = [
  { id: "chatgpt", name: "ChatGPT", description: "OpenAI's GPT models", accent: "#059669" },
  { id: "gemini", name: "Gemini", description: "Google's Gemini models", accent: "#2563EB" },
  { id: "claude", name: "Claude", description: "Anthropic's Claude models", accent: "#EA580C" },
  { id: "deepseek", name: "DeepSeek", description: "DeepSeek's chat models", accent: "#7C3AED" },
  { id: "perplexity", name: "Perplexity", description: "Search-augmented answers", accent: "#0891B2" },
  { id: "grok", name: "Grok", description: "xAI's Grok models", accent: "#DC2626" },
  { id: "blackbox", name: "Blackbox", description: "AI coding assistant", accent: "#CA8A04" },
  { id: "copilot", name: "Copilot", description: "Microsoft's Copilot", accent: "#0284C7" },
];

// Short badge text shown on platform chips in the sidebar/graph panels.
const AGENT_ABBR: Record<string, string> = {
  chatgpt: "GPT",
  gemini: "GEM",
  claude: "CLU",
  deepseek: "DSK",
  perplexity: "PPX",
  grok: "GRK",
  blackbox: "BBX",
  copilot: "COP",
};

/** platform id → display label. Includes the `mscopilot` alias used by some extractors. */
export const PLATFORM_LABELS: Record<string, string> = AI_AGENTS.reduce(
  (acc, a) => ({ ...acc, [a.id]: a.name }),
  { mscopilot: "Copilot", "brain-shadow": "Shadow Brain" } as Record<string, string>
);

/** platform id → accent hex color. Includes the `mscopilot` alias. */
export const PLATFORM_COLORS: Record<string, string> = AI_AGENTS.reduce(
  (acc, a) => ({ ...acc, [a.id]: a.accent }),
  { mscopilot: "#0284C7", "brain-shadow": "#2563EB" } as Record<string, string>
);

/** platform id → 3-letter abbreviation, used for message-avatar initials. */
export const PLATFORM_ABBR: Record<string, string> = AI_AGENTS.reduce(
  (acc, a) => ({ ...acc, [a.id]: AGENT_ABBR[a.id] }),
  { mscopilot: "COP", "brain-shadow": "AI" } as Record<string, string>
);

/** Combined { label, color } lookup, convenient for components that only need one map. */
export const PLATFORM_META: Record<string, { label: string; color: string }> = AI_AGENTS.reduce(
  (acc, a) => ({ ...acc, [a.id]: { label: a.name, color: a.accent } }),
  { mscopilot: { label: "Copilot", color: "#0284C7" } } as Record<string, { label: string; color: string }>
);
