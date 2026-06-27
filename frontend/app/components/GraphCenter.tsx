"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare, Clock, ChevronLeft } from "lucide-react";
import { ObsidianGraph } from "./ObsidianGraph";
import { ChatSession, Message } from "@/app/types";

interface GraphCenterProps {
  searchKeyword: string;
  onNodeSelect?: (nodeId: number, keyword: string) => void;
  sessions?: ChatSession[];
}

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function fmtDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/**
 * Deterministically map a search topic (keyword) to a single node ID, so the
 * same topic always lights up exactly that one node — never any other node,
 * regardless of how many chat sessions match it.
 */
function topicToNodeId(topic: string): number {
  let h = 0;
  for (let i = 0; i < topic.length; i++) h = (h * 31 + topic.charCodeAt(i)) >>> 0;
  // Keep away from first CENTER_NODES (0-7) so we don't hit the center cluster
  return 8 + (h % 992);
}

export function GraphCenter({ searchKeyword, onNodeSelect, sessions = [] }: GraphCenterProps) {
  const [selectedNode, setSelectedNode] = useState<{ nodeId: number; keyword: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const kw = searchKeyword.trim().toLowerCase();

  // Find sessions that match the current search keyword
  const matchingSessions = useMemo(() => {
    if (kw.length < 2) return [];
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(kw) ||
        s.messages.some((m) => m.content.toLowerCase().includes(kw))
    );
  }, [sessions, kw]);

  // Only ONE node lights up per searched topic — never any other node
  const topicNodeId = useMemo(() => (kw.length >= 2 ? topicToNodeId(kw) : null), [kw]);

  const highlightedNodeIds = useMemo(() => {
    const ids = new Set<number>();
    if (topicNodeId !== null && matchingSessions.length > 0) ids.add(topicNodeId);
    return ids;
  }, [topicNodeId, matchingSessions]);

  // The single highlighted node always represents the current topic, so every
  // matching session (across all chats on that topic) groups under it
  const sessionsForNode = useMemo(() => {
    if (!selectedNode) return [];
    return matchingSessions;
  }, [selectedNode, matchingSessions]);

  const handleNodeClick = useCallback((nodeId: number, keyword: string) => {
    setSelectedNode({ nodeId, keyword });
    setShowHistory(false);
  }, []);

  const handleTopicBoxClick = useCallback(() => {
    setShowHistory(true);
  }, []);

  const handleBack = useCallback(() => {
    setShowHistory(false);
  }, []);

  const handleClose = useCallback(() => {
    setShowHistory(false);
    setSelectedNode(null);
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

        <div className="flex items-center gap-2 flex-wrap justify-end max-w-[420px]">
          {[
            { color: "#f97316", label: "Claude AI" },
            { color: "#8b5cf6", label: "Copilot" },
            { color: "#ffffff", label: "ChatGPT" },
            { color: "#3b82f6", label: "Gemini" },
            { color: "#facc15", label: "Grok" },
            { color: "#3ddc97", label: "DeepSeek" },
            { color: "#fb7185", label: "Perplexity" },
            { color: "#b87333", label: "BackBox" },
          ].map((item) => (
            <div key={item.label} className="hidden sm:flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: item.color, boxShadow: `0 0 5px ${item.color}` }}
              />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{item.label}</span>
            </div>
          ))}
          <div
            className="px-2.5 py-1 rounded-lg text-[10px]"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            1,000 nodes
          </div>
        </div>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative">
        <ObsidianGraph
          searchKeyword={searchKeyword}
          highlightedNodeIds={highlightedNodeIds}
          onNodeClick={handleNodeClick}
        />

        {/* Search active banner */}
        <AnimatePresence>
          {kw.length > 1 && (
            <motion.div
              key="search-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-[11px] font-medium"
              style={{
                background: "rgba(79,138,255,0.15)",
                border: "1px solid var(--border-glow)",
                color: "var(--blue)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 0 20px rgba(79,138,255,0.2)",
                whiteSpace: "nowrap",
              }}
            >
              ✦ {matchingSessions.length > 0
                ? `1 node highlighted for "${searchKeyword}" (${matchingSessions.length} conversation${matchingSessions.length > 1 ? "s" : ""}) — click it`
                : `No chat history found for "${searchKeyword}"`}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Topic square box — appears after clicking a highlighted node */}
        <AnimatePresence>
          {selectedNode && !showHistory && (
            <motion.div
              key="topic-box"
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              onClick={handleTopicBoxClick}
              className="absolute top-16 right-4 rounded-xl cursor-pointer select-none"
              style={{
                background: "rgba(10,14,28,0.96)",
                border: "2px solid #4f8aff",
                boxShadow: "0 0 32px rgba(79,138,255,0.4), 0 0 0 1px rgba(79,138,255,0.1)",
                minWidth: "230px",
                backdropFilter: "blur(16px)",
                overflow: "hidden",
              }}
            >
              {/* Blue accent bar at top */}
              <div style={{ height: 3, background: "linear-gradient(90deg,#4f8aff,#8b5cf6)" }} />

              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center"
                      style={{ background: "rgba(79,138,255,0.15)" }}
                    >
                      <MessageSquare size={12} style={{ color: "#4f8aff" }} />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#4f8aff" }}>
                      Topic Found
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClose(); }}
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <p
                  className="text-[18px] font-bold mb-3 leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  &ldquo;{selectedNode.keyword}&rdquo;
                </p>

                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg mb-3"
                  style={{ background: "rgba(79,138,255,0.08)", border: "1px solid rgba(79,138,255,0.15)" }}
                >
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Matching chats
                  </span>
                  <span className="text-[13px] font-bold" style={{ color: "#4f8aff" }}>
                    {sessionsForNode.length}
                  </span>
                </div>

                <div
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[11px] font-semibold"
                  style={{
                    background: "linear-gradient(135deg, rgba(79,138,255,0.2), rgba(139,92,246,0.2))",
                    border: "1px solid rgba(79,138,255,0.3)",
                    color: "#4f8aff",
                  }}
                >
                  <span>View full chat history</span>
                  <span style={{ opacity: 0.7 }}>→</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full chat history overlay — slides up smoothly */}
        <AnimatePresence>
          {showHistory && selectedNode && (
            <motion.div
              key="history-overlay"
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="absolute inset-0 flex flex-col"
              style={{
                background: "rgba(6,8,18,0.98)",
                backdropFilter: "blur(24px)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-4 flex-shrink-0"
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                  background: "rgba(10,14,28,0.9)",
                }}
              >
                <div className="flex items-center gap-3">
                  <motion.button
                    onClick={handleBack}
                    whileHover={{ x: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-lg"
                    style={{
                      color: "var(--text-secondary)",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <ChevronLeft size={13} />
                    Back
                  </motion.button>

                  <div>
                    <p className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
                      Chat History
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Topic: <span style={{ color: "#4f8aff" }}>&ldquo;{selectedNode.keyword}&rdquo;</span>
                      <span className="ml-2" style={{ color: "var(--border-subtle)" }}>·</span>
                      <span className="ml-2">{sessionsForNode.length} conversation{sessionsForNode.length !== 1 ? "s" : ""}</span>
                    </p>
                  </div>
                </div>

                <button onClick={handleClose} style={{ color: "var(--text-muted)" }}>
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable chat content */}
              <div className="flex-1 overflow-y-auto p-5" style={{ gap: 20 }}>
                {sessionsForNode.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <MessageSquare size={36} style={{ color: "var(--text-muted)", opacity: 0.25 }} />
                    <p className="text-[14px] font-medium" style={{ color: "var(--text-muted)" }}>
                      No chat history found for &ldquo;{selectedNode.keyword}&rdquo;
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                      Start a new conversation to build your memory graph.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5 max-w-2xl mx-auto w-full">
                    {sessionsForNode.map((session, sIdx) => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: sIdx * 0.06, duration: 0.3 }}
                        className="rounded-2xl overflow-hidden"
                        style={{
                          background: "rgba(15,20,40,0.8)",
                          border: "1px solid var(--border-subtle)",
                          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                        }}
                      >
                        {/* Session header */}
                        <div
                          className="flex items-center justify-between px-4 py-3"
                          style={{
                            background: "rgba(79,138,255,0.06)",
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center"
                              style={{ background: "linear-gradient(135deg,#4f8aff22,#8b5cf622)", border: "1px solid rgba(79,138,255,0.2)" }}
                            >
                              <MessageSquare size={13} style={{ color: "#4f8aff" }} />
                            </div>
                            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                              {session.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={10} style={{ color: "var(--text-muted)" }} />
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {fmtDate(session.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Messages */}
                        {session.messages.length === 0 ? (
                          <div className="px-4 py-6 text-center">
                            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No messages yet in this conversation.</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 p-4">
                            {session.messages.map((msg: Message, mIdx: number) => {
                              const isUser = msg.role === "user";
                              const hasKw = msg.content.toLowerCase().includes(kw);
                              return (
                                <motion.div
                                  key={msg.id}
                                  initial={{ opacity: 0, x: isUser ? 12 : -12 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: sIdx * 0.06 + mIdx * 0.04 }}
                                  className="flex gap-2.5"
                                  style={{ flexDirection: isUser ? "row-reverse" : "row" }}
                                >
                                  {/* Avatar */}
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                                    style={{
                                      background: isUser
                                        ? "linear-gradient(135deg,#4f8aff,#8b5cf6)"
                                        : "linear-gradient(135deg,#1f2937,#374151)",
                                      color: "#fff",
                                      marginTop: 2,
                                      boxShadow: isUser ? "0 0 10px rgba(79,138,255,0.3)" : "none",
                                    }}
                                  >
                                    {isUser ? "U" : "AI"}
                                  </div>

                                  {/* Bubble */}
                                  <div
                                    className="rounded-2xl px-4 py-2.5 max-w-[78%]"
                                    style={{
                                      background: isUser
                                        ? "rgba(79,138,255,0.12)"
                                        : "rgba(255,255,255,0.04)",
                                      border: `1px solid ${
                                        hasKw
                                          ? "rgba(79,138,255,0.5)"
                                          : isUser
                                          ? "rgba(79,138,255,0.2)"
                                          : "var(--border-subtle)"
                                      }`,
                                      boxShadow: hasKw
                                        ? "0 0 12px rgba(79,138,255,0.18)"
                                        : "none",
                                    }}
                                  >
                                    <p
                                      className="text-[13px] leading-relaxed"
                                      style={{ color: "var(--text-primary)" }}
                                    >
                                      {msg.content}
                                    </p>
                                    <p
                                      className="text-[9px] mt-1.5"
                                      style={{ color: "var(--text-muted)", textAlign: isUser ? "right" : "left" }}
                                    >
                                      {fmtTime(msg.timestamp)}
                                    </p>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
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
    </div>
  );
}
