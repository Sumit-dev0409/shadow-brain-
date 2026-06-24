"use client";

import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <motion.div
      className="flex gap-3 max-w-[800px] w-full mx-auto justify-start"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] flex-shrink-0 mt-0.5"
        style={{
          background: "linear-gradient(135deg, #4f8aff, #8b5cf6)",
          boxShadow: "0 0 12px rgba(79,138,255,0.35)",
        }}
      >
        🧠
      </div>

      <div
        className="px-4 py-3.5 rounded-2xl flex items-center gap-1.5"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border-subtle)",
          borderTopLeftRadius: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block rounded-full"
            style={{ width: 7, height: 7, background: "var(--blue)" }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
