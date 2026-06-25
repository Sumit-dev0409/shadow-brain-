"use client";

import { motion } from "framer-motion";
import { Menu, RotateCcw, MoreHorizontal } from "lucide-react";

interface TopBarProps {
  onMenuClick: () => void;
  onClear: () => void;
}

export function TopBar({ onMenuClick, onClear }: TopBarProps) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: "rgba(7,9,15,0.85)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center gap-3">
        <motion.button
          className="md:hidden p-2 rounded-lg"
          style={{ color: "var(--text-secondary)" }}
          onClick={onMenuClick}
          whileHover={{ background: "var(--bg-hover)", scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Menu size={18} />
        </motion.button>

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
      </div>

      <div className="flex items-center gap-2">
        <motion.button
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
          whileHover={{
            border: "1px solid var(--border-glow)",
            color: "var(--text-primary)",
            background: "var(--bg-hover)",
          }}
          whileTap={{ scale: 0.97 }}
        >
          <RotateCcw size={12} />
          <span className="hidden sm:inline">Clear</span>
        </motion.button>

        <motion.button
          className="p-2 rounded-lg"
          style={{
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
          }}
          whileHover={{
            border: "1px solid var(--border-glow)",
            color: "var(--text-primary)",
            background: "var(--bg-hover)",
          }}
          whileTap={{ scale: 0.97 }}
        >
          <MoreHorizontal size={15} />
        </motion.button>
      </div>
    </div>
  );
}
