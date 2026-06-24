"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, User, Zap, X } from "lucide-react";
import { Logo } from "./Logo";
import { ChatSession } from "@/app/types";
import { formatTime } from "@/app/lib/utils";

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const sidebarContent = (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        width: 260,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <Logo />
        <button
          onClick={onMobileClose}
          className="md:hidden p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 16px" }} />

      {/* New Chat */}
      <div className="p-3">
        <motion.button
          onClick={() => { onNewChat(); onMobileClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(79,138,255,0.12), rgba(139,92,246,0.12))",
            border: "1px solid var(--border-glow)",
            color: "var(--text-primary)",
          }}
          whileHover={{
            background: "linear-gradient(135deg, rgba(79,138,255,0.22), rgba(139,92,246,0.22))",
            boxShadow: "0 0 20px rgba(79,138,255,0.2)",
            y: -1,
          }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus size={15} style={{ color: "var(--blue)" }} />
          New chat
        </motion.button>
      </div>

      {/* History */}
      <div className="px-3 mb-2">
        <p
          className="text-[10px] font-semibold tracking-widest uppercase px-1 mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          Recent
        </p>

        <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          {sessions.map((session) => (
            <motion.button
              key={session.id}
              onClick={() => { onSelect(session.id); onMobileClose(); }}
              className="w-full text-left px-3 py-2.5 rounded-lg transition-all relative group"
              style={{
                background: session.id === activeId ? "var(--bg-hover)" : "transparent",
                border: `1px solid ${session.id === activeId ? "var(--border-glow)" : "transparent"}`,
              }}
              whileHover={{ background: "var(--bg-hover)" }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              {session.id === activeId && (
                <motion.span
                  layoutId="active-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r"
                  style={{
                    height: "60%",
                    background: "linear-gradient(180deg, #4f8aff, #8b5cf6)",
                  }}
                />
              )}
              <div className="flex items-center gap-2.5">
                <MessageSquare
                  size={13}
                  style={{ color: session.id === activeId ? "var(--blue)" : "var(--text-muted)", flexShrink: 0 }}
                />
                <div className="min-w-0">
                  <p
                    className="text-[12.5px] truncate leading-tight"
                    style={{ color: session.id === activeId ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    {session.title}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {formatTime(session.lastMessageAt)}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      {/* Footer */}
      <div className="p-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <motion.div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
          whileHover={{ background: "var(--bg-hover)" }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #1e3a8a, #4f8aff)",
              boxShadow: "0 0 10px rgba(79,138,255,0.3)",
            }}
          >
            <User size={14} style={{ color: "white" }} />
          </div>
          <div>
            <p className="text-[12.5px] font-medium" style={{ color: "var(--text-primary)" }}>You</p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Pro Plan · Active</p>
          </div>
          <Zap size={13} className="ml-auto" style={{ color: "#8b5cf6" }} />
        </motion.div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen">{sidebarContent}</div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
              onClick={onMobileClose}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
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
