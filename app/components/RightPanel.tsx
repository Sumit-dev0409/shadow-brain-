"use client";

import { Search, X, Clock, Sparkles, ChevronRight, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SearchRecord {
  keyword: string;
  count: number;
  firstAt: number;
  lastAt: number;
}

interface RightPanelProps {
  searchKeyword: string;
  onSearchChange: (kw: string) => void;
  searchHistory: SearchRecord[];
  onHistoryUpdate: (record: SearchRecord) => void;
  onForgetPast: () => void;
}

const CATEGORY_LABELS = ["ChatGPT", "Claude AI", "Gemini", "Copilot", "Perplexity", "Grok", "DeepSeek", "Blackbox"];
const CATEGORY_COLORS = ["#10a37f", "#f97316", "#3b82f6", "#8b5cf6", "#14b8a6", "#ef4444", "#06b6d4", "#22c55e"];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ordinal(n: number): string {
  if (n === 1) return "1st search";
  if (n === 2) return "2nd search";
  if (n === 3) return "3rd search";
  return `${n}th search`;
}

function categoryForKeyword(kw: string): number {
  let hash = 0;
  for (let i = 0; i < kw.length; i++) hash = (hash * 31 + kw.charCodeAt(i)) & 0xffff;
  return hash % CATEGORY_LABELS.length;
}

export function RightPanel({
  searchKeyword,
  onSearchChange,
  searchHistory,
  onHistoryUpdate,
  onForgetPast,
}: RightPanelProps) {
  const [selectedRecord, setSelectedRecord] = useState<SearchRecord | null>(null);
  const [showMsg, setShowMsg] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef<string>("");

  useEffect(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    const kw = searchKeyword.trim().toLowerCase();
    if (kw.length < 2) return;

    commitTimerRef.current = setTimeout(() => {
      if (kw === lastCommitted.current) return;
      lastCommitted.current = kw;
      const existing = searchHistory.find((r) => r.keyword === kw);
      if (existing) {
        onHistoryUpdate({ ...existing, count: existing.count + 1, lastAt: Date.now() });
      } else {
        onHistoryUpdate({ keyword: kw, count: 1, firstAt: Date.now(), lastAt: Date.now() });
      }
    }, 600);

    return () => { if (commitTimerRef.current) clearTimeout(commitTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKeyword]);

  const recommendations = [...searchHistory]
    .sort((a, b) => b.lastAt - a.lastAt || b.count - a.count)
    .slice(0, 6);

  const activeKw = searchKeyword.trim().toLowerCase();

  function handleRecordClick(record: SearchRecord) {
    setSelectedRecord(record);
    setShowMsg(true);
    onSearchChange(record.keyword);
  }

  function handleForgetConfirmed() {
    onForgetPast();
    setSelectedRecord(null);
    setShowMsg(false);
    setShowConfirm(false);
    lastCommitted.current = "";
  }

  const cat = selectedRecord ? categoryForKeyword(selectedRecord.keyword) : 0;

  return (
    <div
      className="hidden md:flex flex-col h-full flex-shrink-0"
      style={{
        background: "var(--bg-panel)",
        borderLeft: "1px solid var(--border-subtle)",
        width: "30%",
        minWidth: 280,
      }}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px]"
            style={{
              background: "linear-gradient(135deg, #4f8aff, #8b5cf6)",
              boxShadow: "0 0 14px rgba(79,138,255,0.35)",
            }}
          >
            🧠
          </div>
          <div>
            <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Memory Search
            </p>
            <p className="text-[9px] tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
              Search History
            </p>
          </div>
        </div>

        {searchHistory.length > 0 && !showConfirm && (
          <motion.button
            onClick={() => setShowConfirm(true)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
            style={{
              background: "rgba(239,68,68,0.07)",
              border: "1px solid rgba(239,68,68,0.18)",
              color: "#f87171",
            }}
          >
            <Trash2 size={11} />
            Forget Past
          </motion.button>
        )}

        {showConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5"
          >
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Sure?</span>
            <button
              onClick={handleForgetConfirmed}
              className="px-2 py-1 rounded text-[10px] font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              Yes, forget
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-2 py-1 rounded text-[10px]"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
            >
              Cancel
            </button>
          </motion.div>
        )}
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)", margin: "0 16px" }} />

      {/* Recommendations area */}
      <div className="flex-1 overflow-y-auto p-3">
        <AnimatePresence mode="popLayout">

          {showMsg && selectedRecord && (
            <motion.div
              key="detail-msg"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="mb-3 p-3 rounded-xl relative"
              style={{
                background: "var(--bg-surface)",
                border: `1px solid ${CATEGORY_COLORS[cat]}44`,
                boxShadow: `0 0 18px ${CATEGORY_COLORS[cat]}22`,
              }}
            >
              <button
                onClick={() => setShowMsg(false)}
                className="absolute top-2.5 right-2.5"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={13} />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: CATEGORY_COLORS[cat], boxShadow: `0 0 6px ${CATEGORY_COLORS[cat]}` }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: CATEGORY_COLORS[cat] }}>
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                Nodes highlighted for &ldquo;{selectedRecord.keyword}&rdquo;
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                You&apos;ve explored this topic{" "}
                <strong style={{ color: "var(--text-primary)" }}>{selectedRecord.count}×</strong> — first{" "}
                {timeAgo(selectedRecord.firstAt)}, most recently {timeAgo(selectedRecord.lastAt)}.
                The graph is now highlighting related memory nodes in the{" "}
                <span style={{ color: CATEGORY_COLORS[cat] }}>{CATEGORY_LABELS[cat]}</span> cluster.
              </p>
            </motion.div>
          )}

          {recommendations.length > 0 && (
            <motion.div key="recs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Sparkles size={11} style={{ color: "var(--blue)" }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  {activeKw.length >= 2 ? "Related searches" : "Recent searches"}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {recommendations
                  .filter((r) => activeKw.length < 2 || r.keyword.includes(activeKw) || activeKw.includes(r.keyword))
                  .concat(
                    activeKw.length >= 2
                      ? recommendations.filter(
                          (r) => !r.keyword.includes(activeKw) && !activeKw.includes(r.keyword)
                        )
                      : []
                  )
                  .slice(0, 6)
                  .map((record, idx) => {
                    const isActive = record.keyword === activeKw;
                    const c = categoryForKeyword(record.keyword);
                    return (
                      <motion.button
                        key={record.keyword}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        onClick={() => handleRecordClick(record)}
                        className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 group transition-all"
                        style={{
                          background: isActive ? "var(--bg-hover)" : "var(--bg-surface)",
                          border: `1px solid ${isActive ? CATEGORY_COLORS[c] + "55" : "var(--border-subtle)"}`,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            background: CATEGORY_COLORS[c],
                            boxShadow: `0 0 5px ${CATEGORY_COLORS[c]}`,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                            {record.keyword}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Clock size={9} style={{ color: "var(--text-muted)" }} />
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {ordinal(record.count)} · {timeAgo(record.lastAt)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          size={13}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "var(--text-muted)" }}
                        />
                      </motion.button>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {recommendations.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-40 text-center gap-2"
            >
              <Sparkles size={22} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Search something below to see
                <br />your history &amp; recommendations here.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Search box */}
      <div className="p-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div
          className="flex items-center gap-3 px-4 py-4 rounded-2xl"
          style={{
            background: "var(--bg-surface)",
            border: `1px solid ${searchKeyword ? "var(--border-glow)" : "var(--border-subtle)"}`,
            transition: "border-color 0.2s, box-shadow 0.2s",
            boxShadow: searchKeyword
              ? "0 0 0 2px rgba(79,138,255,0.08), 0 0 16px rgba(79,138,255,0.1)"
              : "none",
          }}
        >
          <Search
            size={18}
            style={{
              color: searchKeyword ? "var(--blue)" : "var(--text-muted)",
              flexShrink: 0,
              transition: "color 0.2s",
            }}
          />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search past chats…"
            className="flex-1 bg-transparent outline-none text-[15px] min-w-0"
            style={{ color: "var(--text-primary)", fontFamily: "inherit" }}
          />
          {searchKeyword && (
            <button
              onClick={() => { onSearchChange(""); lastCommitted.current = ""; }}
              style={{ color: "var(--text-muted)" }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
