"use client";

import { motion } from "framer-motion";

interface LogoProps {
  collapsed?: boolean;
}

export function Logo({ collapsed = false }: LogoProps) {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <motion.div
        className="relative flex-shrink-0"
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[18px] font-bold"
          style={{
            background: "linear-gradient(135deg, #4f8aff, #8b5cf6)",
            boxShadow: "0 0 20px rgba(79,138,255,0.45), 0 0 40px rgba(139,92,246,0.2)",
          }}
        >
          🧠
        </div>
        <span
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse-glow"
          style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }}
        />
      </motion.div>

      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col leading-tight"
        >
          <span
            className="text-[15px] font-semibold"
            style={{
              background: "linear-gradient(90deg, #7eb3ff, #b08bff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Brain Shadow
          </span>
          <span
            className="text-[10px] font-medium tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            AI Memory
          </span>
        </motion.div>
      )}
    </div>
  );
}
