"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, User, Bot, LogOut, X, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { Logo } from "./Logo";
import { SettingsModal } from "./SettingsModal";
import { SessionRowSkeleton } from "./Skeleton";
import { ChatSession } from "@/app/types";
import { formatTime } from "@/app/lib/utils";
import { PLATFORM_META } from "@/app/lib/agents";

// Normalize mscopilot → copilot for agent matching
function normalizePlatform(p?: string) {
  return p === "mscopilot" ? "copilot" : (p ?? "");
}

function SessionRow({
  session,
  activeId,
  showPlatformBadge,
  onSelect,
  index = 0,
}: {
  session: ChatSession;
  activeId: string;
  showPlatformBadge: boolean;
  onSelect: () => void;
  index?: number;
}) {
  const isActive = session.id === activeId;
  return (
    <motion.button
      key={session.id}
      onClick={onSelect}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-all relative group"
      style={{
        background: isActive ? "var(--bg-hover)" : "transparent",
        border: `1px solid ${isActive ? "var(--border-glow)" : "transparent"}`,
      }}
      whileHover={{ background: "var(--bg-hover)", x: 2, boxShadow: "0 4px 14px rgba(59, 130, 246,0.08)" }}
      whileTap={{ scale: 0.985 }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.3), duration: 0.2 }}
    >
      {isActive && (
        <motion.span
          layoutId="active-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r"
          style={{ height: "60%", background: "linear-gradient(180deg, #22d3ee, #a855f7, #ec4899)" }}
        />
      )}
      <div className="flex items-start gap-2.5 w-full min-w-0">
        <PlatformDot platform={session.platform} />
        <div className="min-w-0 flex-1">
          <p
            className="text-[12.5px] truncate leading-tight"
            style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}
          >
            {session.title}
          </p>
          {session.topic && session.topic !== session.title && (
            <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--blue)", opacity: 0.8 }}>
              {session.topic}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {showPlatformBadge && session.platform && PLATFORM_META[session.platform] && (
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  background: `${PLATFORM_META[session.platform].color}18`,
                  color: PLATFORM_META[session.platform].color,
                  border: `1px solid ${PLATFORM_META[session.platform].color}33`,
                }}
              >
                {PLATFORM_META[session.platform].label}
              </span>
            )}
            {session.category && (
              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{session.category}</span>
            )}
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
              {formatTime(session.lastMessageAt)}
            </span>
          </div>
        </div>
        {session.importanceScore !== undefined && session.importanceScore >= 4 && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}
          >
            ★{session.importanceScore}
          </span>
        )}
      </div>
    </motion.button>
  );
}

function AgentHistory({
  sessions,
  activeId,
  selectedAgents,
  collapsed,
  onToggleCollapse,
  onSelect,
  loading = false,
}: {
  sessions: ChatSession[];
  activeId: string;
  selectedAgents: string[];
  collapsed: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  loading?: boolean;
}) {
  const multiAgent = selectedAgents.length > 1;

  // Build ordered groups: one per selected agent (in selection order), then "other"
  const groups = useMemo(() => {
    const map: Record<string, ChatSession[]> = {};
    selectedAgents.forEach((id) => { map[id] = []; });
    map["__other__"] = [];

    sessions.forEach((s) => {
      const key = normalizePlatform(s.platform);
      if (map[key] !== undefined) map[key].push(s);
      else map["__other__"].push(s);
    });

    return selectedAgents
      .map((id) => ({ id, sessions: map[id] }))
      .concat(map["__other__"].length ? [{ id: "__other__", sessions: map["__other__"] }] : []);
  }, [sessions, selectedAgents]);

  if (sessions.length === 0 && loading) {
    return (
      <div className="px-3 mb-2 flex flex-col gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SessionRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="px-3 mb-2">
        <p className="text-[11px] px-2 py-3 text-center" style={{ color: "var(--text-muted)" }}>
          No conversations yet.
          <br />Start a new chat above.
        </p>
      </div>
    );
  }

  // Single agent: flat list with a simple header
  if (!multiAgent) {
    const agentId = selectedAgents[0] ?? "";
    const meta = PLATFORM_META[agentId];
    const agentSessions = groups[0]?.sessions ?? sessions;
    return (
      <div className="px-3 mb-2 flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {meta && (
          <div className="flex items-center gap-2 px-1 mb-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
            />
            <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: meta.color }}>
              {meta.label}
            </p>
            <span className="text-[9px] ml-auto" style={{ color: "var(--text-muted)" }}>
              {agentSessions.length} chats
            </span>
          </div>
        )}
        {agentSessions.map((s, i) => (
          <SessionRow key={s.id} session={s} activeId={activeId} showPlatformBadge={false} onSelect={() => onSelect(s.id)} index={i} />
        ))}
      </div>
    );
  }

  // Multiple agents: collapsible container per agent
  return (
    <div className="px-3 mb-2 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
      {groups.map(({ id, sessions: groupSessions }) => {
        if (groupSessions.length === 0) return null;
        const meta = id === "__other__" ? null : PLATFORM_META[id];
        const label = meta?.label ?? "Other";
        const color = meta?.color ?? "var(--text-muted)";
        const isCollapsed = collapsed[id] ?? false;

        return (
          <div
            key={id}
            className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${color}22`, background: `${color}06` }}
          >
            {/* Agent header */}
            <button
              onClick={() => onToggleCollapse(id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
              style={{ background: `${color}10` }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: color, boxShadow: `0 0 6px ${color}` }}
              />
              <span className="text-[10.5px] font-semibold tracking-wide flex-1" style={{ color }}>
                {label}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full mr-1"
                style={{ background: `${color}20`, color }}
              >
                {groupSessions.length}
              </span>
              {isCollapsed
                ? <ChevronRight size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                : <ChevronDown size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              }
            </button>

            {/* Sessions */}
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="px-1 pb-1 pt-0.5 flex flex-col gap-0.5">
                    {groupSessions.map((s, i) => (
                      <SessionRow key={s.id} session={s} activeId={activeId} showPlatformBadge={false} onSelect={() => onSelect(s.id)} index={i} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function PlatformDot({ platform }: { platform?: string }) {
  const meta = platform ? PLATFORM_META[platform] : null;
  if (!meta) return <MessageSquare size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />;
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
      style={{ background: meta.color, boxShadow: `0 0 5px ${meta.color}88`, minWidth: 8 }}
    />
  );
}

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  userEmail?: string;
  agentCount?: number;
  selectedAgents?: string[];
  onChangeAgents?: () => void;
  onLogout?: () => void;
  sessionsLoading?: boolean;
}

export function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNewChat,
  isMobileOpen,
  onMobileClose,
  userEmail,
  agentCount = 0,
  selectedAgents = [],
  onChangeAgents,
  onLogout,
  sessionsLoading = false,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Icon-only rail — shown on desktop when the sidebar is collapsed
  const railContent = (
    <div
      className="flex flex-col items-center h-full py-4"
      style={{
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        width: "100%",
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--accent-gradient)", boxShadow: "var(--shadow-glow-blue)" }}
      >
        <span className="text-[13px] font-bold text-white">SB</span>
      </div>

      <div className="my-4" style={{ width: 28, height: 1, background: "var(--border-subtle)" }} />

      <motion.button
        onClick={onNewChat}
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.16), rgba(139,92,246,0.16))",
          border: "1px solid var(--border-subtle)",
        }}
        whileHover={{ boxShadow: "var(--shadow-glow-blue)", y: -1 }}
        whileTap={{ scale: 0.94 }}
        title="New chat"
      >
        <Plus size={16} style={{ color: "var(--blue)" }} />
      </motion.button>

      <div className="flex-1" />

      <motion.button
        onClick={() => setSettingsOpen(true)}
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mb-2"
        style={{ color: "var(--text-secondary)" }}
        whileHover={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
        whileTap={{ scale: 0.94 }}
        title="Settings"
      >
        <Settings size={16} />
      </motion.button>

      <motion.button
        onClick={() => setRailCollapsed(false)}
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mb-2"
        style={{ color: "var(--text-secondary)" }}
        whileHover={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
        whileTap={{ scale: 0.94 }}
        title="Expand sidebar"
      >
        <PanelLeftOpen size={16} />
      </motion.button>

      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
          boxShadow: "0 0 10px rgba(59,130,246,0.3)",
        }}
        title={userEmail ?? "You"}
      >
        <User size={14} style={{ color: "white" }} />
      </div>
    </div>
  );

  const sidebarContent = (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        width: "100%",
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-1">
          <motion.button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            whileHover={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
            whileTap={{ scale: 0.94 }}
            title="Settings"
          >
            <Settings size={16} />
          </motion.button>
          <motion.button
            onClick={() => setRailCollapsed(true)}
            className="hidden md:flex p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            whileHover={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}
            whileTap={{ scale: 0.94 }}
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </motion.button>
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 16px" }} />

      {/* New Chat — shimmering gradient border for a bit of premium sparkle */}
      <div className="p-3">
        <div className="rounded-xl p-[1px] border-sweep">
          <motion.button
            onClick={() => { onNewChat(); onMobileClose(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-[11px] text-[13px] font-medium transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(59, 130, 246,0.12), rgba(139,92,246,0.12))",
              color: "var(--text-primary)",
            }}
            whileHover={{
              background: "linear-gradient(135deg, rgba(59, 130, 246,0.22), rgba(139,92,246,0.22))",
              boxShadow: "0 0 20px rgba(59, 130, 246,0.2)",
              y: -1,
            }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={15} style={{ color: "var(--blue)" }} />
            New chat
          </motion.button>
        </div>
      </div>

      {/* History — grouped by agent when multiple selected */}
      <AgentHistory
        sessions={sessions}
        activeId={activeId}
        selectedAgents={selectedAgents}
        collapsed={collapsed}
        onToggleCollapse={(id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))}
        onSelect={(id) => { onSelect(id); onMobileClose(); }}
        loading={sessionsLoading}
      />

      <div className="flex-1" />

      {/* Footer */}
      <div className="relative p-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-3 right-3 bottom-[calc(100%+4px)] rounded-xl overflow-hidden p-1"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-glow)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <button
                onClick={() => { setMenuOpen(false); onChangeAgents?.(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[12px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                <Bot size={14} style={{ color: "var(--blue)" }} />
                Change AI agents
              </button>
              <button
                onClick={() => { setMenuOpen(false); onLogout?.(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[12px] font-medium"
                style={{ color: "#f87171" }}
              >
                <LogOut size={14} />
                Log out
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-left"
          style={{ background: menuOpen ? "var(--bg-hover)" : "transparent" }}
          whileHover={{ background: "var(--bg-hover)" }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
              boxShadow: "0 0 10px rgba(59, 130, 246,0.3)",
            }}
          >
            <User size={14} style={{ color: "white" }} />
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {userEmail ?? "You"}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {agentCount} agent{agentCount === 1 ? "" : "s"} connected
            </p>
          </div>
        </motion.button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <motion.div
        className="hidden md:flex h-screen overflow-hidden"
        animate={{ width: railCollapsed ? 68 : 260 }}
        initial={false}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        style={{ flexShrink: 0 }}
      >
        {railCollapsed ? railContent : sidebarContent}
      </motion.div>

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

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userEmail={userEmail}
        selectedAgents={selectedAgents}
        onChangeAgents={onChangeAgents}
        onLogout={onLogout}
      />
    </>
  );
}
