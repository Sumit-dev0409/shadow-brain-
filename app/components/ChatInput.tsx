"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Send, Paperclip, Mic } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="px-4 pb-5 pt-3" style={{ background: "var(--bg-deep)" }}>
      <div
        className="max-w-[780px] mx-auto"
        style={{
          background: "var(--bg-glass)",
          backdropFilter: "blur(16px) saturate(140%)",
          WebkitBackdropFilter: "blur(16px) saturate(140%)",
          border: `1px solid ${canSend ? "var(--border-glow)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-md)",
          transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: canSend ? "0 0 0 3px rgba(59, 130, 246,0.08), 0 0 24px rgba(59, 130, 246,0.12)" : "var(--shadow-soft)",
        }}
      >
        <div className="flex items-end gap-2 px-3.5 py-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Ask Shadow Brain anything…"
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none outline-none text-[13.5px] leading-[1.6] bg-transparent"
            style={{
              color: "var(--text-primary)",
              minHeight: 22,
              maxHeight: 140,
              fontFamily: "inherit",
            }}
          />

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <motion.button
              className="p-1.5 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              whileHover={{ color: "var(--text-secondary)", scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Attach file"
            >
              <Paperclip size={16} />
            </motion.button>

            <motion.button
              className="p-1.5 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              whileHover={{ color: "var(--text-secondary)", scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Voice input"
            >
              <Mic size={16} />
            </motion.button>

            <motion.button
              onClick={handleSend}
              disabled={!canSend}
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: canSend
                  ? "var(--accent-gradient)"
                  : "var(--bg-surface)",
                color: "white",
                cursor: canSend ? "pointer" : "not-allowed",
                boxShadow: canSend ? "0 0 14px rgba(59, 130, 246,0.4)" : "none",
                transition: "all 0.2s",
              }}
              whileHover={canSend ? { scale: 1.08, boxShadow: "0 0 22px rgba(59, 130, 246,0.6)" } : {}}
              whileTap={canSend ? { scale: 0.94 } : {}}
            >
              <Send size={14} style={{ marginLeft: 1 }} />
            </motion.button>
          </div>
        </div>
      </div>

      <p className="text-center text-[10.5px] mt-2 max-w-[780px] mx-auto" style={{ color: "var(--text-muted)" }}>
        Shadow Brain remembers context across all your past conversations.
      </p>
    </div>
  );
}
