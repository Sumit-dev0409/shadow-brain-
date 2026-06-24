"use client";

import { motion } from "framer-motion";
import { Menu, RotateCcw, ExternalLink } from "lucide-react";
import { ChatSession } from "@/app/types";
import { platformEmoji } from "@/app/lib/utils";

interface TopBarProps {
  onMenuClick: () => void;
  onClear:     () => void;
  session?:    ChatSession;
}

export function TopBar({ onMenuClick, onClear, session }: TopBarProps) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3 flex-shrink-0"
      style={{
        borderBottom:   "1px solid var(--border-subtle)",
        background:     "rgba(7,9,15,0.85)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile menu toggle */}
        <motion.button
          className="md:hidden p-2 rounded-lg flex-shrink-0"
          style={{ color: "var(--text-secondary)" }}
          onClick={onMenuClick}
          whileHover={{ background: "var(--bg-hover)", scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Menu size={18} />
        </motion.button>

        {/* Session info */}
        {session?.isFromBackend ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] flex-shrink-0">{platformEmoji(session.platform)}</span>
            <div className="min-w-0">
              <p
                className="text-[12.5px] font-semibold truncate"
                style={{ color: "var(--text-primary)", maxWidth: 300 }}
              >
                {session.title}
              </p>
              {session.topic && (
                <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                  {session.topic}
                </p>
              )}
            </div>
            {session.url && (
              <a
                href={session.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11.5px] font-medium"
            style={{
              background: "rgba(79,138,255,0.1)",
              border:     "1px solid var(--border-glow)",
              color:      "var(--blue)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }}
            />
            Brain Shadow
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Platform badge */}
        {session?.platform && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium hidden sm:inline-flex items-center gap-1"
            style={{
              background: "rgba(139,92,246,0.12)",
              border:     "1px solid rgba(139,92,246,0.25)",
              color:      "#a78bfa",
            }}
          >
            {session.platform}
          </span>
        )}

        <motion.button
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{ border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
          whileHover={{ border: "1px solid var(--border-glow)", color: "var(--text-primary)", background: "var(--bg-hover)" }}
          whileTap={{ scale: 0.97 }}
        >
          <RotateCcw size={12} />
          <span className="hidden sm:inline">Clear</span>
        </motion.button>
      </div>
    </div>
  );
}
