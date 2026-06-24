"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { ObsidianGraph } from "./ObsidianGraph";

interface GraphCenterProps {
  searchKeyword: string;
  onNodeSelect?: (nodeId: number, keyword: string) => void;
}

export function GraphCenter({ searchKeyword, onNodeSelect }: GraphCenterProps) {
  const [selectedNode, setSelectedNode] = useState<{ nodeId: number; keyword: string } | null>(null);

  const handleNodeClick = useCallback((nodeId: number, keyword: string) => {
    setSelectedNode({ nodeId, keyword });
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
          {/* Node legend */}
          {[
            { color: "#f97316", label: "Claude AI" },
            { color: "#8b5cf6", label: "Copilot" },
            { color: "#374151", label: "ChatGPT" },
            { color: "#3b82f6", label: "Gemini" },
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
        <ObsidianGraph searchKeyword={searchKeyword} onNodeClick={handleNodeClick} />

        {/* Keyword overlay if active */}
        {searchKeyword.trim().length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-[11px] font-medium"
            style={{
              background: "rgba(79,138,255,0.15)",
              border: "1px solid var(--border-glow)",
              color: "var(--blue)",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 20px rgba(79,138,255,0.2)",
            }}
          >
            ✦ Highlighting nodes for "{searchKeyword}"
          </motion.div>
        )}

        {/* Selected node box */}
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-16 right-4 p-4 rounded-lg cursor-pointer"
            style={{
              background: "var(--bg-surface)",
              border: "2px solid #4f8aff",
              boxShadow: "0 0 20px rgba(79,138,255,0.3)",
              minWidth: "200px",
            }}
            onClick={() => onNodeSelect?.(selectedNode.nodeId, selectedNode.keyword)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Selected Topic
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(null);
                }}
                className="text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-[13px] font-medium" style={{ color: "#4f8aff" }}>
              "{selectedNode.keyword}"
            </p>
            <p className="text-[10px] mt-2" style={{ color: "var(--text-secondary)" }}>
              Click to view chat history
            </p>
          </motion.div>
        )}

        {/* Bottom label */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] select-none"
          style={{ color: "var(--text-muted)" }}
        >
          Shadow Brain Memory Network · Continuously rotating
        </div>
      </div>
    </div>
  );
}
