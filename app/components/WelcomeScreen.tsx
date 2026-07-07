"use client";

import { motion } from "framer-motion";

interface WelcomeProps {
  onSuggest: (text: string) => void;
}

const suggestions = [
  { icon: "📋", title: "This week's tasks", desc: "What's on my plate?", prompt: "What tasks do I have this week?" },
  { icon: "🔁", title: "Resume yesterday", desc: "Pick up where I left off", prompt: "Remind me what I was working on yesterday." },
  { icon: "💡", title: "Recent ideas", desc: "Browse saved thoughts", prompt: "What ideas have I saved recently?" },
  { icon: "🔔", title: "Set a reminder", desc: "Never miss a deadline", prompt: "Set a reminder for my project deadline." },
];

export function WelcomeScreen({ onSuggest }: WelcomeProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 gap-7">
      {/* Orb */}
      <motion.div
        className="animate-float"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
      >
        <div
          className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-[34px]"
          style={{
            background: "var(--accent-gradient)",
            boxShadow: "0 0 40px rgba(34,211,238,0.3), 0 0 80px rgba(236,72,153,0.25)",
          }}
        >
          🧠
        </div>
      </motion.div>

      {/* Headline */}
      <motion.div
        className="flex flex-col items-center gap-3 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h1 className="shimmer-text text-2xl sm:text-[28px] font-semibold leading-tight">
          Your AI Memory Never Forgets
        </h1>
        <p className="text-[13.5px] max-w-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Ask me anything. I remember everything you&apos;ve shared — notes, tasks, and ideas — so you never have to repeat yourself.
        </p>
      </motion.div>

      {/* Suggestion cards */}
      <motion.div
        className="grid grid-cols-2 gap-2.5 w-full max-w-[480px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {suggestions.map((s, i) => (
          <motion.button
            key={s.title}
            onClick={() => onSuggest(s.prompt)}
            className="text-left p-4 rounded-xl transition-all glass-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + i * 0.05 }}
            whileHover={{
              border: "1px solid var(--border-glow)",
              background: "var(--bg-hover)",
              y: -2,
              boxShadow: "0 8px 24px rgba(59, 130, 246,0.1)",
            }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="text-[18px] mb-2">{s.icon}</div>
            <p className="text-[12.5px] font-medium" style={{ color: "var(--text-primary)" }}>{s.title}</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.desc}</p>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
