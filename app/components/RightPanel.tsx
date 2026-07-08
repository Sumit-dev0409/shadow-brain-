"use client";

import { Search, X, Clock, Sparkles, ChevronRight, Trash2, ArrowRight } from "lucide-react";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SearchRecord {
  keyword: string;
  count: number;
  firstAt: number;
  lastAt: number;
  summary?: string;
}

interface RightPanelProps {
  searchKeyword: string;
  onSearchChange: (kw: string) => void;
  onSearchSubmit?: () => void;
  onOpenPanel?: () => void;
  searchHistory: SearchRecord[];
  onHistoryUpdate: (record: SearchRecord) => void;
  onForgetPast: () => void;
  isSearchLoading?: boolean;
  resultsPanelContent?: ReactNode;
}

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

export function RightPanel({
  searchKeyword,
  onSearchChange,
  onSearchSubmit,
  onOpenPanel,
  searchHistory,
  onHistoryUpdate,
  onForgetPast,
  isSearchLoading = false,
  resultsPanelContent,
}: RightPanelProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const lastCommitted = useRef<string>("");

  const recommendations = [...searchHistory]
    .sort((a, b) => b.lastAt - a.lastAt || b.count - a.count)
    .slice(0, 6);

  const activeKw = searchKeyword.trim().toLowerCase();

  function handleRecordClick(record: SearchRecord) {
    onSearchChange(record.keyword);
    onOpenPanel?.();
  }

  function handleForgetConfirmed() {
    onForgetPast();
    setShowConfirm(false);
    lastCommitted.current = "";
  }

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
              background: "var(--accent-gradient)",
              boxShadow: "0 0 14px rgba(34,211,238,0.3)",
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
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3 scrollable-area">
          <AnimatePresence mode="popLayout">

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
                            border: `1px solid ${isActive ? "rgba(79,138,255,0.4)" : "var(--border-subtle)"}`,
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              background: "#4f8aff",
                              boxShadow: "0 0 5px #4f8aff88",
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
                            {record.summary && (
                              <p className="text-[10.5px] mt-1.5 leading-snug line-clamp-3" style={{ color: "var(--text-secondary)" }}>
                                {record.summary}
                              </p>
                            )}
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

          <div id="memory-search-results-host" className="flex flex-col gap-3 min-h-0">
            {resultsPanelContent && (
              <div className="min-h-0 overflow-y-auto max-h-[60vh] scrollable-area">
                {resultsPanelContent}
              </div>
            )}
          </div>
        </div>
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
              ? "0 0 0 2px rgba(59, 130, 246,0.08), 0 0 16px rgba(59, 130, 246,0.1)"
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearchSubmit?.();
              }
            }}
            placeholder="Search past chats…"
            className="flex-1 bg-transparent outline-none text-[15px] min-w-0"
            style={{ color: "var(--text-primary)", fontFamily: "inherit" }}
          />
          <button
            type="button"
            onClick={() => onSearchSubmit?.()}
            disabled={isSearchLoading || searchKeyword.trim().length < 1}
            className="p-2 rounded-lg transition-colors"
            style={{
              background: isSearchLoading || searchKeyword.trim().length < 1 ? "rgba(255,255,255,0.08)" : "rgba(79,138,255,0.16)",
              color: isSearchLoading || searchKeyword.trim().length < 1 ? "var(--text-muted)" : "var(--blue)",
              border: "1px solid rgba(79,138,255,0.18)",
              cursor: isSearchLoading || searchKeyword.trim().length < 1 ? "not-allowed" : "pointer",
            }}
          >
            <ArrowRight size={14} />
          </button>
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
