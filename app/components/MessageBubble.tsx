"use client";

import { motion } from "framer-motion";
import { Message } from "@/app/types";

interface MessageBubbleProps {
  message: Message;
}

function renderContent(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i} style={{ color: "var(--text-secondary)" }}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

function formatMessage(content: string) {
  return content.split("\n").map((line, i) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith("•") || trimmed.startsWith("-");
    return (
      <span key={i} className={`block ${isBullet ? "pl-2" : ""} ${i > 0 ? "mt-1" : ""}`}>
        {renderContent(line)}
      </span>
    );
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      className={`flex gap-3 max-w-[800px] w-full mx-auto ${isUser ? "justify-end" : "justify-start"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      {/* AI avatar */}
      {!isUser && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] flex-shrink-0 mt-0.5"
          style={{
            background: "linear-gradient(135deg, #4f8aff, #8b5cf6)",
            boxShadow: "0 0 12px rgba(79,138,255,0.35)",
          }}
        >
          🧠
        </div>
      )}

      {/* Bubble */}
      <motion.div
        className="max-w-[72%] px-4 py-3 rounded-2xl text-[13.5px] leading-[1.65]"
        style={
          isUser
            ? {
                background: "linear-gradient(135deg, #1e3a6e, #1e4d96)",
                border: "1px solid rgba(79,138,255,0.28)",
                borderTopRightRadius: 4,
                color: "#dce8ff",
              }
            : {
                background: "var(--bg-panel)",
                border: "1px solid var(--border-subtle)",
                borderTopLeftRadius: 4,
                color: "var(--text-primary)",
              }
        }
        whileHover={{ scale: 1.005 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {formatMessage(message.content)}
      </motion.div>

      {/* User avatar */}
      {isUser && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0 mt-0.5"
          style={{
            background: "linear-gradient(135deg, #1e3a8a, #4f8aff)",
            boxShadow: "0 0 10px rgba(79,138,255,0.25)",
            color: "white",
          }}
        >
          U
        </div>
      )}
    </motion.div>
  );
}
