"use client";

import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Clock, Sparkles, Loader2, X } from "lucide-react";
import { ObsidianGraph } from "./ObsidianGraph";
import { ChatSession, Message } from "@/app/types";
import { searchMemory, MemorySource } from "@/app/lib/api";

interface GraphCenterProps {
  searchKeyword: string;
  searchTriggerKey?: number;
  onAiSourcesChange?: (sources: MemorySource[]) => void;
  onAiAnswerReady?: (keyword: string, answer: string) => void;
  onAiLoadingChange?: (loading: boolean) => void;
  onResultsPanelContentChange?: (content: ReactNode | null) => void;
  panelResetKey?: number;
  sessions?: ChatSession[];
  sessionsLoading?: boolean;
  selectedAgents?: string[];
}

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt:    "#10a37f",
  claude:     "#f97316",
  gemini:     "#3b82f6",
  copilot:    "#8b5cf6",
  mscopilot:  "#8b5cf6",
  perplexity: "#14b8a6",
  grok:       "#ef4444",
  deepseek:   "#06b6d4",
  blackbox:        "#22c55e",
  "brain-shadow":  "#4f8aff",
};

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt:    "ChatGPT",
  claude:     "Claude",
  gemini:     "Gemini",
  copilot:    "Copilot",
  mscopilot:  "Copilot",
  perplexity: "Perplexity",
  grok:       "Grok",
  deepseek:   "DeepSeek",
  blackbox:   "Blackbox",
};

const PLATFORM_ABBR: Record<string, string> = {
  chatgpt:        "GPT",
  claude:         "CLU",
  gemini:         "GEM",
  copilot:        "COP",
  mscopilot:      "COP",
  perplexity:     "PPX",
  grok:           "GRK",
  deepseek:       "DSK",
  blackbox:       "BBX",
  "brain-shadow": "AI",
};

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function fmtDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function fmtNodeDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

/** Short label shown on the canvas node e.g. "Jun 18" */

/**
 * Deterministically map a session to a node ID so the same session
 * always lights up the same node across renders.
 */
function sessionToNodeId(sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  // Keep away from first CENTER_NODES (0-7) so we don't hit the center cluster
  return 8 + (h % 992);
}

function ConversationSessionCard({
  session,
  searchKeyword,
  filterMessagesByKeyword = false,
}: {
  session: ChatSession;
  searchKeyword: string;
  filterMessagesByKeyword?: boolean;
}) {
  const hasAnyContent = session.messages.some(m => (m.content || "").trim().length > 0);
  const platformColor = session.platform ? PLATFORM_COLORS[session.platform] ?? "#4f8aff" : "#4f8aff";
  const visibleMessages = filterMessagesByKeyword
    ? session.messages.filter((msg: Message) => {
        const content = (msg.content || "").trim();
        return content && content.toLowerCase().includes(searchKeyword.toLowerCase());
      })
    : session.messages;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(15,20,40,0.8)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ background: "rgba(79,138,255,0.06)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: platformColor }} />
          <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {session.title}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {session.platform && PLATFORM_LABELS[session.platform] && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: `${platformColor}18`,
                color: platformColor,
                border: `1px solid ${platformColor}33`,
              }}
            >
              {PLATFORM_LABELS[session.platform]}
            </span>
          )}
          <div className="flex items-center gap-1 ml-1">
            <Clock size={9} style={{ color: "var(--text-muted)" }} />
            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
              {fmtDate(session.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {(session.summary || session.topic || (session.keywords && session.keywords.length > 0)) && (
        <div
          className="px-3 py-2.5"
          style={{ background: `${platformColor}08`, borderBottom: "1px solid var(--border-subtle)" }}
        >
          {session.topic && (
            <p className="text-[10px] font-semibold mb-1" style={{ color: platformColor }}>
              {session.topic}
            </p>
          )}
          {session.summary && (
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {session.summary}
            </p>
          )}
          {session.keywords && session.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {session.keywords.slice(0, 6).map((kw) => (
                <span
                  key={kw}
                  className="text-[9px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: `${platformColor}18`,
                    color: "var(--text-secondary)",
                    border: `1px solid ${platformColor}22`,
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {session.messages.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No messages recorded.</p>
        </div>
      ) : !hasAnyContent ? (
        <div className="px-4 py-5 text-center">
          <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>
            {session.messages.length} message{session.messages.length !== 1 ? "s" : ""} — content not captured
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
            The conversation was indexed for search but full text was not stored.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {visibleMessages.map((msg: Message) => {
            const content = (msg.content || "").trim();
            const isUser = msg.role === "user";
            return (
              <div key={msg.id} className="flex gap-2" style={{ flexDirection: isUser ? "row-reverse" : "row" }}>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold"
                  style={{
                    background: isUser ? "linear-gradient(135deg,#4f8aff,#8b5cf6)" : platformColor,
                    color: "#fff",
                    marginTop: 2,
                    boxShadow: isUser ? "0 0 8px rgba(79,138,255,0.3)" : "none",
                  }}
                >
                  {isUser ? "U" : (session.platform ? PLATFORM_ABBR[session.platform] ?? "AI" : "AI")}
                </div>
                <div
                  className="rounded-xl px-3 py-2 min-w-0"
                  style={{
                    maxWidth: "calc(100% - 32px)",
                    background: isUser ? "rgba(79,138,255,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isUser ? "rgba(79,138,255,0.2)" : "var(--border-subtle)"}`,
                    boxShadow: "none",
                  }}
                >
                  <div className="max-h-[200px] overflow-y-auto scrollable-area">
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {content}
                    </p>
                  </div>
                  <p className="text-[9px] mt-1" style={{ color: "var(--text-muted)", textAlign: isUser ? "right" : "left" }}>
                    {fmtTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

interface SearchResultsPanelProps {
  displayedSessions: ChatSession[];
  searchKeyword: string;
  aiLoading: boolean;
  aiAnswer: string;
  aiSources: MemorySource[];
  pinnedNodeId: number | null;
  onUnpin: () => void;
  onDismiss: () => void;
}

function SearchResultsPanel({
  displayedSessions,
  searchKeyword,
  aiLoading,
  aiAnswer,
  aiSources,
  pinnedNodeId,
  onUnpin,
  onDismiss,
}: SearchResultsPanelProps) {
  console.log('[SearchResultsPanel] render', {
    aiLoading,
    aiAnswerLength: aiAnswer.length,
    aiAnswerPreview: aiAnswer.slice(0, 120),
    aiSourcesLength: aiSources.length,
    displayedSessionsLength: displayedSessions.length,
  });
  return (
    <div className="w-full flex flex-col rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)", background: "rgba(6,8,18,0.98)" }}>
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(10,14,28,0.9)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
            {displayedSessions.length === 1 ? displayedSessions[0].title : "Memory Search Results"}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {displayedSessions.length === 1 && displayedSessions[0].platform && PLATFORM_LABELS[displayedSessions[0].platform] && (
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  background: `${PLATFORM_COLORS[displayedSessions[0].platform]}18`,
                  color: PLATFORM_COLORS[displayedSessions[0].platform],
                  border: `1px solid ${PLATFORM_COLORS[displayedSessions[0].platform]}33`,
                }}
              >
                {PLATFORM_LABELS[displayedSessions[0].platform]}
              </span>
            )}
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              &ldquo;{searchKeyword}&rdquo; · {displayedSessions.length} conversation{displayedSessions.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {pinnedNodeId !== null && (
            <button
              onClick={onUnpin}
              className="flex-shrink-0 px-2 py-1 rounded text-[10px]"
              style={{ color: "var(--blue)", background: "rgba(79,138,255,0.1)", border: "1px solid rgba(79,138,255,0.2)" }}
            >
              Show all
            </button>
          )}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1 rounded"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Hint row */}
      <div
        className="px-4 py-2 text-[10px] flex-shrink-0"
        style={{
          background: "rgba(79,138,255,0.06)",
          borderBottom: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        {pinnedNodeId !== null
          ? "↙ Click another highlighted node to switch · or Show all to see every match"
          : "✦ Click any highlighted node to filter to that conversation"}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* AI Answer block — always at top when search is active */}
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} style={{ color: "#8b5cf6" }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#8b5cf6" }}>
              AI Memory Answer
            </span>
          </div>

          {aiLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={13} className="animate-spin" style={{ color: "var(--text-muted)" }} />
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Searching memory…</span>
            </div>
          ) : aiAnswer ? (
            <>
              <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                {aiAnswer}
              </p>

              {aiSources.length > 0 && (
                <div className="flex flex-col gap-2 mt-3">
                  <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                    Sources ({aiSources.length})
                  </span>
                  {aiSources.map((src) => {
                    const color = src.platform ? PLATFORM_COLORS[src.platform] ?? "#4f8aff" : "#4f8aff";
                    const label = src.platform ? PLATFORM_LABELS[src.platform] ?? src.platform : "";
                    return (
                      <div
                        key={src.id}
                        className="rounded-lg px-3 py-2"
                        style={{
                          background: `${color}10`,
                          border: `1px solid ${color}28`,
                        }}
                      >
                        <p className="text-[10px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {src.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {label && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
                              {label}
                            </span>
                          )}
                          {src.role && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
                              {src.role === "user" ? "You" : "AI"}
                            </span>
                          )}
                          {src.date && (
                            <span className="flex items-center gap-1 text-[9px]" style={{ color: "var(--text-muted)" }}>
                              <Clock size={8} />
                              {src.date}
                            </span>
                          )}
                        </div>
                        {src.snippet && (
                          <p className="text-[10px] leading-relaxed mt-1.5 line-clamp-3" style={{ color: "var(--text-secondary)" }}>
                            {src.snippet}
                          </p>
                        )}
                        {src.keywords && src.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {src.keywords.slice(0, 5).map((kw) => (
                              <span
                                key={kw}
                                className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: `${color}15`, color: "var(--text-muted)", border: `1px solid ${color}20` }}
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              No memory answer yet — type to search.
            </p>
          )}
        </div>

        <div className="p-4">
          {displayedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <MessageSquare size={32} style={{ color: "var(--text-muted)", opacity: 0.25 }} />
              <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
                No conversations for this node
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                Try clicking a brighter highlighted node.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {displayedSessions.map((session, sIdx) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: sIdx * 0.05 }}
                >
                  <ConversationSessionCard session={session} searchKeyword={searchKeyword} filterMessagesByKeyword={true} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Matching helpers ────────────────────────────────────────────────────────

function stem(w: string): string {
  if (w.length <= 3) return w;
  const rules: [string, string][] = [
    ["ations","ate"],["nesses",""],["ments",""],["ities",""],
    ["ation","ate"],["tions",""],["izing",""],["ising",""],
    ["ness",""],["ment",""],["ical",""],["able",""],["ible",""],
    ["ized",""],["ised",""],["ings",""],["ally",""],["edly",""],
    ["ing",""],["ied","y"],["ies","y"],["ion",""],["ive",""],
    ["ous",""],["ful",""],["ish",""],["ed",""],["er",""],
    ["es",""],["ly",""],["s",""],
  ];
  for (const [suf, rep] of rules) {
    if (w.endsWith(suf) && w.length - suf.length >= 3)
      return w.slice(0, w.length - suf.length) + rep;
  }
  return w;
}

// Related-term clusters for AI/tech domains
const CLUSTERS: string[][] = [
  ["ai","artificial intelligence","ml","machine learning","deep learning","neural network","llm","gpt","language model","generative","transformer"],
  ["python","py","pandas","numpy","sklearn","scikit","tensorflow","pytorch","keras","jupyter","notebook","colab"],
  ["javascript","js","typescript","ts","node","nodejs","react","vue","angular","frontend","web","browser","dom","html","css"],
  ["code","coding","programming","program","script","scripting","software","development","developer","implement","implementation","engineer"],
  ["data","dataset","database","sql","nosql","mongo","postgres","mysql","query","analytics","analysis","statistics","excel","csv","json"],
  ["api","rest","restful","http","endpoint","request","response","graphql","websocket","fetch","axios","webhook"],
  ["bug","error","issue","problem","fix","debug","debugging","crash","exception","traceback","troubleshoot"],
  ["cloud","aws","azure","gcp","docker","kubernetes","container","devops","cicd","deploy","deployment","server","hosting"],
  ["image","photo","picture","vision","ocr","recognition","detect","detection","classify","segmentation"],
  ["nlp","natural language","text","sentence","token","embed","embedding","semantic","sentiment","summarize","summarization"],
  ["function","method","class","object","variable","array","list","dict","map","loop","recursion","algorithm"],
  ["test","testing","unit test","integration","mock","assert","jest","pytest","qa","quality"],
  ["git","github","gitlab","version","branch","commit","merge","pull request","pr","repo","repository"],
  ["design","ui","ux","interface","layout","figma","style","color","font","responsive","accessibility"],
  ["performance","speed","optimiz","latency","throughput","cache","scalab","efficient"],
  ["security","auth","authentication","login","password","encrypt","jwt","oauth","token","permission","access"],
  ["finance","stock","invest","trading","crypto","blockchain","bitcoin","market","portfolio","dividend"],
  ["health","medical","doctor","hospital","medicine","drug","diagnosis","symptom","treatment","clinical"],
  ["power bi","dax","powerbi","measure","visual","report","dashboard","bi","business intelligence","kpi"],
];

function getSynonyms(word: string, stemmedWord: string): string[] {
  for (const cluster of CLUSTERS) {
    if (cluster.some(term => term === word || term === stemmedWord || term.split(" ").includes(word) || term.split(" ").includes(stemmedWord))) {
      return cluster.filter(t => !t.includes(" ")); // single-word synonyms only for matching
    }
  }
  return [];
}

function wordScore(text: string, word: string, stemmedWord: string, synonyms: string[]): number {
  if (text.includes(word)) return 1;
  if (stemmedWord.length >= 3 && text.includes(stemmedWord)) return 0.85;
  // Prefix match: search "implement" matches "implementing" and vice versa
  if (word.length >= 4) {
    const textWords = text.split(/\W+/);
    if (textWords.some(tw => tw.startsWith(word) || (tw.length >= 4 && word.startsWith(tw)))) return 0.75;
  }
  // Synonym match
  if (synonyms.some(s => text.includes(s))) return 0.65;
  // Stemmed synonym match
  if (synonyms.some(s => {
    const ss = stem(s);
    return ss.length >= 3 && text.includes(ss);
  })) return 0.5;
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────

export function GraphCenter({ searchKeyword, searchTriggerKey = 0, onAiSourcesChange, onAiAnswerReady, onAiLoadingChange, onResultsPanelContentChange, panelResetKey, sessions = [], sessionsLoading = false, selectedAgents = [] }: GraphCenterProps) {
  // null = auto mode (show all matches); set to a nodeId when user clicks a specific node
  const [pinnedNodeId, setPinnedNodeId] = useState<number | null>(null);
  const [clickedSessions, setClickedSessions] = useState<ChatSession[]>([]);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<ChatSession | null>(null);
  const [isConversationPopupOpen, setConversationPopupOpen] = useState(false);

  // Force-open panel when a history item is clicked (even if same keyword)
  useEffect(() => {
    if (panelResetKey) setPanelDismissed(false);
  }, [panelResetKey]);

  // AI answer from backend memory search
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [aiSources, setAiSources] = useState<MemorySource[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kw = searchKeyword.trim().toLowerCase();

  // Reopen the results panel whenever a new search is explicitly triggered.
  useEffect(() => {
    if (searchTriggerKey > 0 && kw.length >= 2) {
      setPanelDismissed(false);
    }
  }, [searchTriggerKey, kw]);

  const matchingSessions = useMemo(() => {
    if (kw.length < 2) return [];

    const STOP = new Set([
      "the","a","an","is","in","of","and","or","to","for","with","on","at",
      "by","it","as","be","was","are","were","has","have","had","do","does",
      "did","i","my","me","what","how","why","when","where","who","about",
      "can","could","would","should","that","this","these","those","then",
      "than","from","not","but","so","if","all","any","will","just","also",
      "into","its","their","they","them","there","here","get","got","use",
      "using","used","make","made","want","need","help","please","give",
    ]);

    const rawWords = kw.split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
    if (rawWords.length === 0) return [];

    const stemmedRaw  = rawWords.map(stem);
    const synonymsRaw = rawWords.map((w, i) => getSynonyms(w, stemmedRaw[i]));

    // More lenient threshold for longer queries
    const minMatchCount =
      rawWords.length <= 2 ? rawWords.length :
      rawWords.length <= 4 ? Math.ceil(rawWords.length * 0.5) :
                             Math.ceil(rawWords.length * 0.4);

    // Full phrase match is a very strong signal
    const fullPhrase = rawWords.join(" ");

    return sessions
      .map(s => {
        const platformLabel = (s.platform ? PLATFORM_LABELS[s.platform] ?? s.platform : "").toLowerCase();
        const title    = s.title.toLowerCase();
        const kwText   = (s.keywords ?? []).join(" ").toLowerCase();
        const topic    = (s.topic ?? "").toLowerCase();
        const summary  = (s.summary ?? "").toLowerCase();
        const category = (s.category ?? "").toLowerCase();
        const msgs     = s.messages.map(m => m.content).join(" ").toLowerCase();

        let score = 0;
        let matched = 0;

        // Bonus for full phrase appearing anywhere
        if (rawWords.length > 1) {
          if (title.includes(fullPhrase))   score += 30;
          if (topic.includes(fullPhrase))   score += 25;
          if (summary.includes(fullPhrase)) score += 18;
          if (msgs.includes(fullPhrase))    score += 12;
        }

        // Per-word scoring with stemming + synonyms
        for (let i = 0; i < rawWords.length; i++) {
          const word = rawWords[i];
          const sw   = stemmedRaw[i];
          const syns = synonymsRaw[i];

          const ts  = wordScore(title,         word, sw, syns);
          const ks  = wordScore(kwText,        word, sw, syns);
          const ps  = wordScore(topic,         word, sw, syns);
          const ss  = wordScore(summary,       word, sw, syns);
          const cs  = wordScore(category,      word, sw, syns);
          const pls = wordScore(platformLabel, word, sw, syns);
          const ms  = wordScore(msgs,          word, sw, syns);

          const best = Math.max(ts, ks, ps, ss, cs, pls, ms);
          if (best > 0) {
            score   += ts * 10 + ks * 8 + ps * 7 + ss * 5 + cs * 4 + pls * 3 + ms * 1;
            matched += best; // fractional credit for partial/synonym matches
          }
        }

        return { s, score, matched };
      })
      .filter(x => x.matched >= minMatchCount * 0.75) // allow fractional tolerance
      .sort((a, b) => b.score - a.score)
      .map(x => x.s);
  }, [sessions, kw]);

  // Build both the color map (for ObsidianGraph) and a sessions lookup (for the panel)
  // in one pass over matchingSessions so they're always in sync.
  const { highlightedNodes, nodeSessionsMap, nodeDates } = useMemo(() => {
    const colorMap = new Map<number, string>();
    const sessMap  = new Map<number, ChatSession[]>();
    const dateMap  = new Map<number, string>();
    matchingSessions.forEach((s) => {
      const nodeId = sessionToNodeId(s.id);
      const color  = (s.platform && PLATFORM_COLORS[s.platform]) ? PLATFORM_COLORS[s.platform] : "#4f8aff";
      colorMap.set(nodeId, color);
      const existing = sessMap.get(nodeId) ?? [];
      sessMap.set(nodeId, [...existing, s]);
      // Use the earliest session date for this node (first to set wins)
      if (!dateMap.has(nodeId)) {
        dateMap.set(nodeId, fmtNodeDate(s.lastMessageAt ?? s.createdAt));
      }
    });
    return { highlightedNodes: colorMap, nodeSessionsMap: sessMap, nodeDates: dateMap };
  }, [matchingSessions]);

  // Keep a ref so handleNodeClick always reads the latest map without needing it as a dep
  const nodeSessionsMapRef = useRef(nodeSessionsMap);
  nodeSessionsMapRef.current = nodeSessionsMap;

  // Clear previous search state when the input is empty or too short.
  useEffect(() => {
    if (kw.length < 2) {
      setPinnedNodeId(null);
      setClickedSessions([]);
      setAiAnswer("");
      setAiSources([]);
      onAiSourcesChange?.([]);
      setAiLoading(false);
      onAiLoadingChange?.(false);
      if (aiDebounce.current) clearTimeout(aiDebounce.current);
    }
  }, [kw, onAiSourcesChange, onAiLoadingChange]);

  // Run the existing memory search only when the user explicitly submits.
  useEffect(() => {
    if (searchTriggerKey === 0) return;
    if (kw.length < 2) {
      setAiLoading(false);
      onAiLoadingChange?.(false);
      return;
    }

    setAiLoading(true);
    onAiLoadingChange?.(true);

    let cancelled = false;

    const runSearch = async () => {
      console.log('[GraphCenter] search start', {
        searchKeyword: searchKeyword.trim(),
        selectedAgents,
        searchTriggerKey,
      });
      try {
        const result = await searchMemory(searchKeyword.trim(), selectedAgents);
        console.log('[GraphCenter] search response', result);
        if (cancelled) return;
        console.log('[GraphCenter] setting aiAnswer', {
          answerLength: result.answer.length,
          answerPreview: result.answer.slice(0, 120),
          sourcesLength: result.sources.length,
        });
        setAiAnswer(result.answer);
        setAiSources(result.sources);
        onAiSourcesChange?.(result.sources);
        onAiAnswerReady?.(searchKeyword.trim().toLowerCase(), result.answer);
      } catch (err) {
        console.error('[GraphCenter] search failed', err);
        if (cancelled) return;
        setAiAnswer("");
        setAiSources([]);
        onAiSourcesChange?.([]);
      } finally {
        if (!cancelled) {
          setAiLoading(false);
          onAiLoadingChange?.(false);
        }
      }
    };

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [searchTriggerKey, kw, searchKeyword, selectedAgents, onAiSourcesChange, onAiAnswerReady, onAiLoadingChange]);

  // Clicking a node: pin to that node's sessions and open the conversation popup.
  const handleNodeClick = useCallback((nodeId: number, _keyword: string) => {
    const found = nodeSessionsMapRef.current.get(nodeId) ?? [];
    setClickedSessions(found);
    setPinnedNodeId(nodeId);
    setPanelDismissed(false);
    if (found.length > 0) {
      setSelectedConversation(found[0]);
      setConversationPopupOpen(true);
    }
  }, []);

  // Unpin — go back to showing all matches
  const handleUnpin = useCallback(() => {
    setPinnedNodeId(null);
    setClickedSessions([]);
  }, []);

  const prevKw = useRef(kw);
  useEffect(() => {
    if (prevKw.current !== kw) {
      prevKw.current = kw;
      if (panelDismissed) {
        setPanelDismissed(false);
      }
    }
  }, [kw, panelDismissed]);

  // Panel is visible only after the user explicitly submits a search.
  const showHistory = searchTriggerKey > 0 && kw.length >= 2 && !panelDismissed;

  // Use LLM-selected sources to filter sessions; use convId (conversation) for session matching
  const aiSourceIds = useMemo(() => new Set(aiSources.map(s => s.convId ?? s.id)), [aiSources]);
  const aiMatchedSessions = useMemo(
    () => aiSources.length > 0 ? sessions.filter(s => aiSourceIds.has(s.id)) : matchingSessions,
    [aiSources, aiSourceIds, sessions, matchingSessions]
  );

  // What to show: pinned node sessions, LLM-filtered sessions, or keyword fallback
  const displayedSessions = pinnedNodeId !== null ? clickedSessions : aiMatchedSessions;

  const handleDismissPanel = useCallback(() => setPanelDismissed(true), []);

  const resultsPanelContent = useMemo(() => {
    if (!showHistory) return null;

    return (
      <SearchResultsPanel
        displayedSessions={displayedSessions}
        searchKeyword={searchKeyword}
        aiLoading={aiLoading}
        aiAnswer={aiAnswer}
        aiSources={aiSources}
        pinnedNodeId={pinnedNodeId}
        onUnpin={handleUnpin}
        onDismiss={handleDismissPanel}
      />
    );
  }, [showHistory, displayedSessions, searchKeyword, aiLoading, aiAnswer, aiSources, pinnedNodeId, handleUnpin, handleDismissPanel]);

  useEffect(() => {
    onResultsPanelContentChange?.(resultsPanelContent);
  }, [resultsPanelContent, onResultsPanelContentChange]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConversationPopupOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
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
          {[
            { color: "#10a37f", label: "ChatGPT" },
            { color: "#f97316", label: "Claude" },
            { color: "#14b8a6", label: "Perplexity" },
            { color: "#ef4444", label: "Grok" },
            { color: "#3b82f6", label: "Gemini" },
            { color: "#8b5cf6", label: "Copilot" },
          ].map((item) => (
            <div key={item.label} className="hidden lg:flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: item.color, boxShadow: `0 0 5px ${item.color}` }}
              />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{item.label}</span>
            </div>
          ))}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            {sessionsLoading ? (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "#4f8aff" }}
                />
                Loading…
              </>
            ) : (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: sessions.length > 0 ? "#34d399" : "var(--text-muted)" }}
                />
                {sessions.length} conversation{sessions.length !== 1 ? "s" : ""} · 1,000 nodes
              </>
            )}
          </div>
        </div>
      </div>

      {/* Graph canvas + overlays — single relative container, history panel is absolute overlay */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0, height: 0 }}>

        {/* Canvas always fills full space */}
        <ObsidianGraph
          searchKeyword={searchKeyword}
          highlightedNodes={highlightedNodes}
onNodeClick={handleNodeClick}
        />

        {/* Idle hint — hidden when panel is open */}
        <AnimatePresence>
          {kw.length < 2 && sessions.length > 0 && !sessionsLoading && !showHistory && (
            <motion.div
              key="idle-hint"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-[11px] font-medium pointer-events-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
                backdropFilter: "blur(8px)",
                whiteSpace: "nowrap",
              }}
            >
              Search in the right panel to highlight and click your conversations
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search active banner — hidden when panel is open */}
        <AnimatePresence>
          {kw.length > 1 && !showHistory && (
            <motion.div
              key="search-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-[11px] font-medium pointer-events-none"
              style={{
                background: "rgba(79,138,255,0.15)",
                border: "1px solid var(--border-glow)",
                color: "var(--blue)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 0 20px rgba(79,138,255,0.2)",
                whiteSpace: "nowrap",
              }}
            >
              {matchingSessions.length > 0 ? (
                <>
                  ✦ {matchingSessions.length} node{matchingSessions.length > 1 ? "s" : ""} highlighted
                  {" — "}
                  {[...new Set(matchingSessions.map((s) => s.platform).filter(Boolean))]
                    .map((p) => PLATFORM_LABELS[p!] ?? p)
                    .join(", ")}
                  {" — click a node"}
                </>
              ) : sessionsLoading ? (
                "⏳ Loading conversations…"
              ) : sessions.length === 0 ? (
                "⚠ No conversations loaded — start the backend"
              ) : (
                `No match for "${searchKeyword}" in ${sessions.length} conversations`
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!showHistory && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] select-none pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          >
            Shadow Brain Memory Network · Continuously rotating
          </div>
        )}

        <AnimatePresence>
          {isConversationPopupOpen && selectedConversation && (
            <motion.div
              key="conversation-popup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8"
              style={{ background: "rgba(2,4,10,0.76)", backdropFilter: "blur(8px)" }}
              onClick={() => setConversationPopupOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.25 }}
                className="relative w-full h-full max-w-5xl max-h-[88vh] rounded-2xl overflow-hidden"
                style={{
                  background: "rgba(7,9,15,0.96)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4"
                  style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(10,14,28,0.92)" }}
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {selectedConversation.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {selectedConversation.platform && PLATFORM_LABELS[selectedConversation.platform] && (
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: `${PLATFORM_COLORS[selectedConversation.platform] ?? "#4f8aff"}18`,
                            color: PLATFORM_COLORS[selectedConversation.platform] ?? "#4f8aff",
                            border: `1px solid ${(PLATFORM_COLORS[selectedConversation.platform] ?? "#4f8aff")}33`,
                          }}
                        >
                          {PLATFORM_LABELS[selectedConversation.platform]}
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {fmtDate(selectedConversation.createdAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setConversationPopupOpen(false)}
                    className="p-2 rounded-lg flex-shrink-0"
                    style={{ color: "var(--text-muted)", background: "rgba(255,255,255,0.04)" }}
                    aria-label="Close conversation"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="h-[calc(100%-57px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                  <ConversationSessionCard session={selectedConversation} searchKeyword="" filterMessagesByKeyword={false} />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
