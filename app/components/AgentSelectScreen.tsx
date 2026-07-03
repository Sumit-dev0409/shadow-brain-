"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { AI_AGENTS } from "@/app/lib/agents";

interface AgentSelectScreenProps {
  initialSelected?: string[];
  onContinue: (agentIds: string[]) => void;
}

export function AgentSelectScreen({ initialSelected = [], onContinue }: AgentSelectScreenProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const allSelected = selected.length === AI_AGENTS.length;

  function toggleAll() {
    setSelected(allSelected ? [] : AI_AGENTS.map((a) => a.id));
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen w-full px-4 py-10"
      style={{ background: "var(--bg-deep)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 10%, rgba(139,92,246,0.12), transparent 40%), radial-gradient(circle at 10% 90%, rgba(79,138,255,0.12), transparent 40%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-[560px] rounded-2xl p-7"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 0 60px rgba(139,92,246,0.08)",
        }}
      >
        <div className="flex flex-col items-center mb-2">
          <Logo />
        </div>

        <h1 className="text-center text-[17px] font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
          Which AI agents should Shadow Brain remember for?
        </h1>
        <p className="text-center text-[12.5px] mt-1.5 mb-5" style={{ color: "var(--text-secondary)" }}>
          Choose any platforms you use, or select them all. You can change this anytime from the sidebar.
        </p>

        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={toggleAll}
            className="text-[11.5px] font-medium"
            style={{ color: "var(--blue)" }}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
          {AI_AGENTS.map((agent) => {
            const isOn = selected.includes(agent.id);
            return (
              <motion.button
                key={agent.id}
                type="button"
                onClick={() => toggle(agent.id)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="relative flex flex-col items-start gap-2 px-3.5 py-3 rounded-xl text-left"
                style={{
                  background: isOn ? "var(--bg-hover)" : "var(--bg-surface)",
                  border: `1px solid ${isOn ? "var(--border-glow)" : "var(--border-subtle)"}`,
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: agent.accent, boxShadow: `0 0 6px ${agent.accent}` }}
                  />
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0"
                    style={{
                      background: isOn ? "var(--blue)" : "transparent",
                      border: `1px solid ${isOn ? "var(--blue)" : "var(--text-muted)"}`,
                    }}
                  >
                    {isOn && <Check size={10} color="white" />}
                  </span>
                </div>
                <div>
                  <p className="text-[12.5px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {agent.name}
                  </p>
                  <p className="text-[10.5px] mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>
                    {agent.description}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>

        <motion.button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onContinue(selected)}
          whileHover={selected.length > 0 ? { y: -1, boxShadow: "0 0 24px rgba(79,138,255,0.35)" } : {}}
          whileTap={selected.length > 0 ? { scale: 0.98 } : {}}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{
            background:
              selected.length === 0 ? "var(--bg-surface)" : "linear-gradient(135deg, #4f8aff, #8b5cf6)",
            color: selected.length === 0 ? "var(--text-muted)" : "white",
            cursor: selected.length === 0 ? "not-allowed" : "pointer",
            border: selected.length === 0 ? "1px solid var(--border-subtle)" : "none",
          }}
        >
          Continue
          <ArrowRight size={14} />
        </motion.button>

        {selected.length === 0 && (
          <p className="text-center text-[11px] mt-2.5" style={{ color: "var(--text-muted)" }}>
            Select at least one agent to continue.
          </p>
        )}
      </motion.div>
    </div>
  );
}
