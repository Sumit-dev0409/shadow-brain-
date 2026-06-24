"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, RefreshCw, User, Zap, X, Loader2 } from "lucide-react";
import { Logo } from "./Logo";
import { ChatSession } from "@/app/types";
import { formatTime, platformEmoji } from "@/app/lib/utils";

interface SidebarProps {
  sessions:      ChatSession[];
  activeId:      string;
  onSelect:      (id: string) => void;
  onNewChat:     () => void;
  onRefresh:     () => void;
  isLoading:     boolean;
  isMobileOpen:  boolean;
  onMobileClose: () => void;
}

// Group sessions by platform
function groupByPlatform(sessions: ChatSession[]) {
  const groups: Record<string, ChatSession[]> = {};
  for (const s of sessions) {
    const key = s.platform || "new";
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return groups;
}

export function Sidebar({
  sessions, activeId, onSelect, onNewChat, onRefresh,
  isLoading, isMobileOpen, onMobileClose,
}: SidebarProps) {

  const sidebarContent = (
    <div
      className="flex flex-col h-full"
      style={{
        background:  "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        width: 270,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            title="Refresh from backend"
          >
            {isLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
          </button>
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 16px" }} />

      {/* New Chat */}
      <div className="p-3">
        <motion.button
          onClick={() => { onNewChat(); onMobileClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(79,138,255,0.12), rgba(139,92,246,0.12))",
            border:     "1px solid var(--border-glow)",
            color:      "var(--text-primary)",
          }}
          whileHover={{
            background: "linear-gradient(135deg, rgba(79,138,255,0.22), rgba(139,92,246,0.22))",
            boxShadow:  "0 0 20px rgba(79,138,255,0.2)",
            y: -1,
          }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus size={15} style={{ color: "var(--blue)" }} />
          New chat
        </motion.button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4" style={{ scrollbarWidth: "thin" }}>
        {isLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-8 gap-2" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[12px]">Loading conversations…</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No conversations yet</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Start the backend and capture from an AI platform</p>
          </div>
        ) : (
          Object.entries(groupByPlatform(sessions)).map(([platform, group]) => (
            <div key={platform} className="mb-3">
              {/* Platform group header */}
              {platform !== "new" && (
                <p
                  className="text-[10px] font-semibold tracking-widest uppercase px-1 mb-1.5 mt-2 flex items-center gap-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span>{platformEmoji(platform)}</span>
                  <span>{platform}</span>
                  <span className="ml-auto opacity-60">({group.length})</span>
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeId}
                    onSelect={() => { onSelect(session.id); onMobileClose(); }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {/* Stats line */}
        <p className="text-[10px] text-center mb-2" style={{ color: "var(--text-muted)" }}>
          {sessions.filter(s => s.isFromBackend).length} conversations from backend
        </p>
        <motion.div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
          whileHover={{ background: "var(--bg-hover)" }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #1e3a8a, #4f8aff)",
              boxShadow:  "0 0 10px rgba(79,138,255,0.3)",
            }}
          >
            <User size={14} style={{ color: "white" }} />
          </div>
          <div>
            <p className="text-[12.5px] font-medium" style={{ color: "var(--text-primary)" }}>You</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Brain Shadow · Active</p>
          </div>
          <Zap size={13} className="ml-auto" style={{ color: "#8b5cf6" }} />
        </motion.div>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:flex h-screen">{sidebarContent}</div>
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
              onClick={onMobileClose}
            />
            <motion.div
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 z-50 md:hidden h-screen"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function SessionItem({ session, isActive, onSelect }: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-all relative group"
      style={{
        background: isActive ? "var(--bg-hover)" : "transparent",
        border:     `1px solid ${isActive ? "var(--border-glow)" : "transparent"}`,
      }}
      whileHover={{ background: "var(--bg-hover)" }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      {isActive && (
        <motion.span
          layoutId="active-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r"
          style={{ height: "60%", background: "linear-gradient(180deg, #4f8aff, #8b5cf6)" }}
        />
      )}
      <div className="flex items-start gap-2">
        {/* Platform emoji */}
        <span className="text-[13px] mt-0.5 flex-shrink-0">
          {session.isFromBackend ? platformEmoji(session.platform) : "💬"}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[12px] truncate leading-tight font-medium"
            style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}
          >
            {session.title}
          </p>
          {/* Topic line (from enrichment) */}
          {session.topic && (
            <p className="text-[10px] truncate mt-0.5 opacity-60" style={{ color: "var(--text-muted)" }}>
              {session.topic}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {formatTime(session.lastMessageAt)}
            </p>
            {session.messages.length > 0 && (
              <span className="text-[9px] px-1 rounded" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                {session.messages.length}msg
              </span>
            )}
            {session.importanceScore && session.importanceScore >= 4 && (
              <span className="text-[9px]">⭐</span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
