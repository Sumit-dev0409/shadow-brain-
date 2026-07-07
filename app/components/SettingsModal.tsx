"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Moon, Bot, LogOut, Mail } from "lucide-react";
import { AI_AGENTS } from "@/app/lib/agents";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
  selectedAgents: string[];
  onChangeAgents?: () => void;
  onLogout?: () => void;
}

export function SettingsModal({ open, onClose, userEmail, selectedAgents, onChangeAgents, onLogout }: SettingsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60]"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[420px] rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Settings
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--text-secondary)" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-5">
              {/* Account */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                  Account
                </p>
                <div
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                >
                  <Mail size={14} style={{ color: "var(--blue)" }} />
                  <span className="text-[12.5px]" style={{ color: "var(--text-primary)" }}>
                    {userEmail ?? "Not signed in"}
                  </span>
                </div>
              </div>

              {/* Appearance */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                  Appearance
                </p>
                <div
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <Moon size={14} style={{ color: "var(--purple)" }} />
                    <span className="text-[12.5px]" style={{ color: "var(--text-primary)" }}>Theme</span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Dark (default)</span>
                </div>
              </div>

              {/* Connected agents */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                  Connected AI agents ({selectedAgents.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {AI_AGENTS.filter((a) => selectedAgents.includes(a.id)).map((a) => (
                    <span
                      key={a.id}
                      className="flex items-center gap-1.5 text-[10.5px] font-medium px-2 py-1 rounded-full"
                      style={{ background: `${a.accent}18`, color: a.accent, border: `1px solid ${a.accent}33` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.accent }} />
                      {a.name}
                    </span>
                  ))}
                  {selectedAgents.length === 0 && (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>None selected</span>
                  )}
                </div>
                <button
                  onClick={() => { onClose(); onChangeAgents?.(); }}
                  className="flex items-center gap-2 mt-3 text-[11.5px] font-medium"
                  style={{ color: "var(--blue)" }}
                >
                  <Bot size={13} />
                  Change AI agents
                </button>
              </div>

              {/* Sign out */}
              <button
                onClick={() => { onClose(); onLogout?.(); }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12.5px] font-medium"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
