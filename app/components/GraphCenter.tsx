"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Clock } from "lucide-react";
import { ObsidianGraph } from "./ObsidianGraph";
import { ChatSession, Message } from "@/app/types";

interface GraphCenterProps {
  searchKeyword: string;
  onNodeSelect?: (nodeId: number, keyword: string) => void;
  sessions?: ChatSession[];
  sessionsLoading?: boolean;
}

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt:    "#10a37f",
  claude:     "#f97316",
  gemini:     "#3b82f6",
  copilot:    "#8b5cf6",
  mscopilot:  "#8b5cf6",
  perplexity: "#14b8a6",
  grok:       "#ef4444",
  deepseek:   "#06b6d4",
  blackbox:        "#22c55e",
  "brain-shadow":  "#4f8aff",
};

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt:    "ChatGPT",
  claude:     "Claude",
  gemini:     "Gemini",
  copilot:    "Copilot",
  mscopilot:  "Copilot",
  perplexity: "Perplexity",
  grok:       "Grok",
  deepseek:   "DeepSeek",
  blackbox:   "Blackbox",
};

const PLATFORM_ABBR: Record<string, string> = {
  chatgpt:        "GPT",
  claude:         "CLU",
  gemini:         "GEM",
  copilot:        "COP",
  mscopilot:      "COP",
  perplexity:     "PPX",
  grok:           "GRK",
  deepseek:       "DSK",
  blackbox:       "BBX",
  "brain-shadow": "AI",
};

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function fmtDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/**
 * Deterministically map a session to a node ID so the same session
 * always lights up the same node across renders.
 */
function sessionToNodeId(sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  // Keep away from first CENTER_NODES (0-7) so we don't hit the center cluster
  return 8 + (h % 992);
}

export function GraphCenter({ searchKeyword, onNodeSelect, sessions = [], sessionsLoading = false }: GraphCenterProps) {
  const [selectedNode, setSelectedNode] = useState<{ nodeId: number; keyword: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Stores the sessions that matched when the node was clicked — avoids stale useMemo re-filter
  const [clickedSessions, setClickedSessions] = useState<ChatSession[]>([]);

  const kw = searchKeyword.trim().toLowerCase();

  // Find sessions matching the search keyword across all metadata + content
  const matchingSessions = useMemo(() => {
    if (kw.length < 2) return [];
    return sessions.filter((s) => {
      const platformLabel = (s.platform ? PLATFORM_LABELS[s.platform] ?? s.platform : "").toLowerCase();
      return (
        s.title.toLowerCase().includes(kw) ||
        (s.topic?.toLowerCase().includes(kw) ?? false) ||
        (s.category?.toLowerCase().includes(kw) ?? false) ||
        (s.keywords?.some((k) => k.toLowerCase().includes(kw)) ?? false) ||
        (s.summary?.toLowerCase().includes(kw) ?? false) ||
        platformLabel.includes(kw) ||
        (s.platform?.toLowerCase().includes(kw) ?? false) ||
        s.messages.some((m) => m.content.toLowerCase().includes(kw))
      );
    });
  }, [sessions, kw]);

  // Build both the color map (for ObsidianGraph) and a sessions lookup (for the panel)
  // in one pass over matchingSessions so they're always in sync.
  const { highlightedNodes, nodeSessionsMap } = useMemo(() => {
    const colorMap = new Map<number, string>();
    const sessMap  = new Map<number, ChatSession[]>();
    matchingSessions.forEach((s) => {
      const nodeId = sessionToNodeId(s.id);
      const color  = (s.platform && PLATFORM_COLORS[s.platform]) ? PLATFORM_COLORS[s.platform] : "#4f8aff";
      colorMap.set(nodeId, color);
      const existing = sessMap.get(nodeId) ?? [];
      sessMap.set(nodeId, [...existing, s]);
    });
    return { highlightedNodes: colorMap, nodeSessionsMap: sessMap };
  }, [matchingSessions]);

  // Keep a ref so handleNodeClick always reads the latest map without needing it as a dep
  const nodeSessionsMapRef = useRef(nodeSessionsMap);
  nodeSessionsMapRef.current = nodeSessionsMap;

  // Clicking a node: look up sessions from the map that was current when highlights were built
  const handleNodeClick = useCallback((nodeId: number, keyword: string) => {
    const found = nodeSessionsMapRef.current.get(nodeId) ?? [];
    setClickedSessions(found);
    setSelectedNode({ nodeId, keyword });
    setShowHistory(true);
  }, []);

  const handleClose = useCallback(() => {
    setShowHistory(false);
    setSelectedNode(null);
    setClickedSessions([]);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden" style={{ background: "var(--bg-deep)" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(7,9,15,0.85)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11.5px] font-medium"
          style={{
            background: "rgba(79,138,255,0.1)",
            border: "1px solid var(--border-glow)",
            color: "var(--blue)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse-glow"
            style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }}
          />
          Shadow Brain v2.1
        </div>

        <div className="flex items-center gap-3">
          {[
            { color: "#10a37f", label: "ChatGPT" },
            { color: "#f97316", label: "Claude" },
            { color: "#14b8a6", label: "Perplexity" },
            { color: "#ef4444", label: "Grok" },
            { color: "#3b82f6", label: "Gemini" },
            { color: "#8b5cf6", label: "Copilot" },
          ].map((item) => (
            <div key={item.label} className="hidden lg:flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: item.color, boxShadow: `0 0 5px ${item.color}` }}
              />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{item.label}</span>
            </div>
          ))}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            {sessionsLoading ? (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "#4f8aff" }}
                />
                Loading…
              </>
            ) : (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: sessions.length > 0 ? "#34d399" : "var(--text-muted)" }}
                />
                {sessions.length} conversation{sessions.length !== 1 ? "s" : ""} · 1,000 nodes
              </>
            )}
          </div>
        </div>
      </div>

      {/* Graph + side history panel — flex row so graph stays interactive */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: graph canvas (always visible & clickable) ── */}
        <div className="flex-1 relative min-w-0">
          <ObsidianGraph
            searchKeyword={searchKeyword}
            highlightedNodes={highlightedNodes}
            onNodeClick={handleNodeClick}
          />

          {/* Idle hint — shown when conversations are loaded but no search yet */}
          <AnimatePresence>
            {kw.length < 2 && sessions.length > 0 && !sessionsLoading && (
              <motion.div
                key="idle-hint"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-[11px] font-medium pointer-events-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                  backdropFilter: "blur(8px)",
                  whiteSpace: "nowrap",
                }}
              >
                Search in the right panel to highlight and click your conversations
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search active banner */}
          <AnimatePresence>
            {kw.length > 1 && (
              <motion.div
                key="search-banner"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-[11px] font-medium pointer-events-none"
                style={{
                  background: "rgba(79,138,255,0.15)",
                  border: "1px solid var(--border-glow)",
                  color: "var(--blue)",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 0 20px rgba(79,138,255,0.2)",
                  whiteSpace: "nowrap",
                }}
              >
                {matchingSessions.length > 0 ? (
                  <>
                    ✦ {matchingSessions.length} node{matchingSessions.length > 1 ? "s" : ""} highlighted
                    {" — "}
                    {[...new Set(matchingSessions.map((s) => s.platform).filter(Boolean))]
                      .map((p) => PLATFORM_LABELS[p!] ?? p)
                      .join(", ")}
                    {" — click a node"}
                  </>
                ) : sessionsLoading ? (
                  "⏳ Loading conversations…"
                ) : sessions.length === 0 ? (
                  "⚠ No conversations loaded — start the backend"
                ) : (
                  `No match for "${searchKeyword}" in ${sessions.length} conversations`
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom label */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] select-none pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          >
            Shadow Brain Memory Network · Continuously rotating
          </div>
        </div>

        {/* ── RIGHT: history side panel (slides in, graph stays clickable) ── */}
        <AnimatePresence>
          {showHistory && selectedNode && (
            <motion.div
              key="history-panel"
              initial={{ width: 0 }}
              animate={{ width: 440 }}
              exit={{ width: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              style={{
                overflow: "hidden",
                flexShrink: 0,
                borderLeft: "1px solid var(--border-subtle)",
                background: "rgba(6,8,18,0.98)",
              }}
            >
              {/* Fixed-width inner so content doesn't squish during animation */}
              <div className="flex flex-col h-full" style={{ width: 440 }}>

                {/* Panel header */}
                <div
                  className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                  style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(10,14,28,0.9)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {clickedSessions.length === 1 ? clickedSessions[0].title : "Chat History"}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      {clickedSessions.length === 1 && clickedSessions[0].platform && PLATFORM_LABELS[clickedSessions[0].platform] && (
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: `${PLATFORM_COLORS[clickedSessions[0].platform]}18`,
                            color: PLATFORM_COLORS[clickedSessions[0].platform],
                            border: `1px solid ${PLATFORM_COLORS[clickedSessions[0].platform]}33`,
                          }}
                        >
                          {PLATFORM_LABELS[clickedSessions[0].platform]}
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        &ldquo;{selectedNode.keyword}&rdquo; · {clickedSessions.length} conversation{clickedSessions.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="ml-2 flex-shrink-0 p-1.5 rounded-lg"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Hint: clicking another node switches conversation */}
                <div
                  className="px-4 py-2 text-[10px] flex-shrink-0"
                  style={{
                    background: "rgba(79,138,255,0.06)",
                    borderBottom: "1px solid var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  ↙ Click any highlighted node in the graph to switch conversation
                </div>

                {/* Scrollable messages */}
                <div className="flex-1 overflow-y-auto p-4">
                  {clickedSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <MessageSquare size={32} style={{ color: "var(--text-muted)", opacity: 0.25 }} />
                      <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
                        No conversations for this node
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                        Try clicking a brighter highlighted node.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {clickedSessions.map((session, sIdx) => (
                        <motion.div
                          key={session.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: sIdx * 0.05 }}
                          className="rounded-xl overflow-hidden"
                          style={{
                            background: "rgba(15,20,40,0.8)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          {/* Session header */}
                          {clickedSessions.length > 1 && (
                            <div
                              className="flex items-center justify-between px-3 py-2.5"
                              style={{ background: "rgba(79,138,255,0.06)", borderBottom: "1px solid var(--border-subtle)" }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: session.platform ? PLATFORM_COLORS[session.platform] ?? "#4f8aff" : "#4f8aff" }}
                                />
                                <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                  {session.title}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                {session.platform && PLATFORM_LABELS[session.platform] && (
                                  <span
                                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                    style={{
                                      background: `${PLATFORM_COLORS[session.platform]}18`,
                                      color: PLATFORM_COLORS[session.platform],
                                      border: `1px solid ${PLATFORM_COLORS[session.platform]}33`,
                                    }}
                                  >
                                    {PLATFORM_LABELS[session.platform]}
                                  </span>
                                )}
                                <div className="flex items-center gap-1 ml-1">
                                  <Clock size={9} style={{ color: "var(--text-muted)" }} />
                                  <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                                    {fmtDate(session.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Messages */}
                          {session.messages.length === 0 ? (
                            <div className="px-4 py-6 text-center">
                              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No messages yet.</p>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 p-3">
                              {session.messages.map((msg: Message, mIdx: number) => {
                                const isUser = msg.role === "user";
                                const hasKw = msg.content.toLowerCase().includes(kw);
                                return (
                                  <div
                                    key={msg.id}
                                    className="flex gap-2"
                                    style={{ flexDirection: isUser ? "row-reverse" : "row" }}
                                  >
                                    {/* Avatar */}
                                    <div
                                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold"
                                      style={{
                                        background: isUser
                                          ? "linear-gradient(135deg,#4f8aff,#8b5cf6)"
                                          : (session.platform ? PLATFORM_COLORS[session.platform] ?? "#374151" : "#374151"),
                                        color: "#fff",
                                        marginTop: 2,
                                        boxShadow: isUser ? "0 0 8px rgba(79,138,255,0.3)" : "none",
                                      }}
                                    >
                                      {isUser ? "U" : (session.platform ? PLATFORM_ABBR[session.platform] ?? "AI" : "AI")}
                                    </div>

                                    {/* Bubble */}
                                    <div
                                      className="rounded-xl px-3 py-2 min-w-0"
                                      style={{
                                        maxWidth: "calc(100% - 32px)",
                                        background: isUser ? "rgba(79,138,255,0.12)" : "rgba(255,255,255,0.04)",
                                        border: `1px solid ${hasKw ? "rgba(79,138,255,0.5)" : isUser ? "rgba(79,138,255,0.2)" : "var(--border-subtle)"}`,
                                        boxShadow: hasKw ? "0 0 10px rgba(79,138,255,0.15)" : "none",
                                      }}
                                    >
                                      <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                                        <p
                                          className="text-[12px] leading-relaxed"
                                          style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                                        >
                                          {msg.content}
                                        </p>
                                      </div>
                                      <p className="text-[9px] mt-1" style={{ color: "var(--text-muted)", textAlign: isUser ? "right" : "left" }}>
                                        {fmtTime(msg.timestamp)}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
