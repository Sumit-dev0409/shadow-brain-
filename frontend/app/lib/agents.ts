export interface AgentOption {
  id: string;
  name: string;
  description: string;
  accent: string;
}

export const AI_AGENTS: AgentOption[] = [
  { id: "chatgpt", name: "ChatGPT", description: "OpenAI's GPT models", accent: "#74aa9c" },
  { id: "claude", name: "Claude", description: "Anthropic's Claude models", accent: "#d97757" },
  { id: "gemini", name: "Gemini", description: "Google's Gemini models", accent: "#4f8aff" },
  { id: "perplexity", name: "Perplexity", description: "Search-augmented answers", accent: "#fb7185" },
  { id: "grok", name: "Grok", description: "xAI's Grok models", accent: "#facc15" },
  { id: "copilot", name: "Copilot", description: "Microsoft's Copilot", accent: "#8b5cf6" },
  { id: "deepseek", name: "DeepSeek", description: "DeepSeek's AI models", accent: "#3ddc97" },
  { id: "backbox", name: "BackBox", description: "BackBox AI assistant", accent: "#b87333" },
];
