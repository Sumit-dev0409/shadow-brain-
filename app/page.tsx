"use client";

import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { RightPanel, SearchRecord } from "./components/RightPanel";
import { GraphCenter } from "./components/GraphCenter";
import { ChatArea } from "./components/ChatArea";
import { AuthScreen } from "./components/AuthScreen";
import { AgentSelectScreen } from "./components/AgentSelectScreen";
import { ChatSession, Message } from "./types";
import { generateId, getMemoryGraph } from "./lib/utils";
import {
  clearSelectedAgents,
  clearSession,
  getSelectedAgents,
  getSession,
  setSelectedAgents,
} from "./lib/auth";
import {
  sendChatMessage,
  fetchConversations,
  saveConversation,
  ApiConversation,
  MemorySource,
} from "./lib/api";

type Stage = "loading" | "auth" | "select-agents" | "app";
type CenterView = "graph" | "chat";

interface AuthState {
  stage: Stage;
  userEmail: string | null;
  selectedAgents: string[];
}

function apiConvToSession(conv: ApiConversation): ChatSession {
  const enr = conv.enrichment ?? {};
  return {
    id: conv._id,
    title: conv.title || enr.topic || "Untitled",
    platform: conv.platform,
    topic: enr.topic,
    category: enr.category,
    keywords: enr.keywords,
    summary: enr.summary,
    importanceScore: enr.importanceScore,
    url: conv.metadata?.url,
    messages: conv.messages.map((m) => ({
      id: generateId(),
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: new Date(m.timestamp),
    })),
    createdAt: new Date(conv.createdAt),
    lastMessageAt: new Date(conv.updatedAt),
  };
}

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({
    stage: "loading",
    userEmail: null,
    selectedAgents: [],
  });
  const { stage, userEmail, selectedAgents } = auth;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const [centerView, setCenterView] = useState<CenterView>("graph");
  const [isTyping, setIsTyping] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchHistory, setSearchHistory] = useState<SearchRecord[]>([]);
  const [aiSources, setAiSources] = useState<MemorySource[]>([]);
  const [panelResetKey, setPanelResetKey] = useState(0);
  const [searchTriggerKey, setSearchTriggerKey] = useState(0);
  const [isMemorySearchLoading, setIsMemorySearchLoading] = useState(false);
  const [resultsPanelContent, setResultsPanelContent] = useState<ReactNode>(null);

  // Track which session IDs have already been saved to backend
  const persistedIds = useRef<Set<string>>(new Set());

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const session = getSession();
    if (!session) {
      setAuth({ stage: "auth", userEmail: null, selectedAgents: [] });
      return;
    }
    const agents = getSelectedAgents();
    if (agents.length === 0) {
      setAuth({ stage: "select-agents", userEmail: session.email, selectedAgents: [] });
      return;
    }
    setAuth({ stage: "app", userEmail: session.email, selectedAgents: agents });
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Load backend conversations once the user is in the app
  useEffect(() => {
    if (stage !== "app") return;
    setSessionsLoading(true);
    fetchConversations().then((convs) => {
      if (convs.length) {
        const backendSessions = convs.map(apiConvToSession);
        backendSessions.forEach((s) => persistedIds.current.add(s.id));
        setSessions((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const fresh = backendSessions.filter((s) => !existingIds.has(s.id));
          return [...fresh, ...prev];
        });
      }
    }).finally(() => setSessionsLoading(false));
  }, [stage]);

  const handleAuthenticated = useCallback((email: string) => {
    const agents = getSelectedAgents();
    setAuth({
      stage: agents.length === 0 ? "select-agents" : "app",
      userEmail: email,
      selectedAgents: agents,
    });
  }, []);

  const handleAgentsSelected = useCallback((agents: string[]) => {
    setSelectedAgents(agents);
    setAuth((prev) => ({ ...prev, stage: "app", selectedAgents: agents }));
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    clearSelectedAgents();
    setAuth({ stage: "auth", userEmail: null, selectedAgents: [] });
  }, []);

  const handleNewChat = useCallback(() => {
    const newSession: ChatSession = {
      id: generateId(),
      title: "New conversation",
      messages: [],
      createdAt: new Date(),
      lastMessageAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveId(newSession.id);
    setCenterView("chat");
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setCenterView("chat");
    setIsMobileOpen(false);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const activeSession = sessions.find((s) => s.id === activeId);
      if (!activeSession) return;

      const isFirstMessage = activeSession.messages.length === 0;

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      // Build history for the API call before the optimistic update
      const history = [
        ...activeSession.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: text },
      ];

      // Optimistically show the user message immediately
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== activeId
            ? s
            : {
                ...s,
                messages: [...s.messages, userMsg],
                title: isFirstMessage ? text.slice(0, 45) : s.title,
                lastMessageAt: new Date(),
              }
        )
      );

      setIsTyping(true);

      try {
        const { content } = await sendChatMessage(history);

        const aiMsg: Message = {
          id: generateId(),
          role: "assistant",
          content,
          timestamp: new Date(),
          graph: getMemoryGraph(text),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id !== activeId
              ? s
              : { ...s, messages: [...s.messages, aiMsg], lastMessageAt: new Date() }
          )
        );

        // Persist to backend (fire-and-forget on first message of a session)
        if (!persistedIds.current.has(activeId)) {
          persistedIds.current.add(activeId);
          saveConversation({
            external_id: activeId,
            platform: "brain-shadow",
            title: isFirstMessage ? text.slice(0, 60) : activeSession.title,
            messages: [...history, { role: "assistant", content }],
          });
        }
      } catch (err) {
        console.error("[Chat]", err);
        const errMsg: Message = {
          id: generateId(),
          role: "assistant",
          content:
            "Sorry, I couldn't reach the AI backend. Make sure the backend server is running on port 8000.",
          timestamp: new Date(),
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id !== activeId
              ? s
              : { ...s, messages: [...s.messages, errMsg], lastMessageAt: new Date() }
          )
        );
      } finally {
        setIsTyping(false);
      }
    },
    [activeId, sessions]
  );

  const handleSuggest = useCallback(
    (text: string) => {
      handleSend(text);
    },
    [handleSend]
  );

  const handleClear = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, messages: [] } : s))
    );
  }, [activeId]);

  const handleHistoryUpdate = useCallback((record: SearchRecord) => {
    setSearchHistory((prev) => {
      const existing = prev.find((r) => r.keyword === record.keyword);
      const merged = existing ? { ...record, summary: record.summary ?? existing.summary } : record;
      return [merged, ...prev.filter((r) => r.keyword !== record.keyword)];
    });
  }, []);

  const handleAiAnswerReady = useCallback((keyword: string, answer: string) => {
    setSearchHistory((prev) =>
      prev.map((r) => r.keyword === keyword ? { ...r, summary: answer } : r)
    );
  }, []);

  const handleForgetPast = useCallback(() => {
    setSearchHistory([]);
    setSearchKeyword("");
  }, []);

  const handleMemorySearchSubmit = useCallback(() => {
    const trimmed = searchKeyword.trim();
    if (!trimmed || isMemorySearchLoading) return;
    setSearchTriggerKey((k) => k + 1);
    setSearchHistory((prev) => {
      const existing = prev.find((r) => r.keyword === trimmed.toLowerCase());
      if (existing) {
        return [
          { ...existing, count: existing.count + 1, lastAt: Date.now(), summary: existing.summary },
          ...prev.filter((r) => r.keyword !== trimmed.toLowerCase()),
        ];
      }
      return [{ keyword: trimmed.toLowerCase(), count: 1, firstAt: Date.now(), lastAt: Date.now() }, ...prev];
    });
  }, [searchKeyword, isMemorySearchLoading]);

  const handleMemorySearchLoadingChange = useCallback((loading: boolean) => {
    setIsMemorySearchLoading(loading);
  }, []);

  // Hooks must be called unconditionally — before any early returns
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()),
    [sessions]
  );

  // Filter to only sessions from selected agents (mscopilot counts as copilot)
  const filteredSessions = useMemo(() => {
    if (selectedAgents.length === 0) return sortedSessions;
    return sortedSessions.filter((s) => {
      if (!s.platform || s.platform === "brain-shadow") return true;
      const key = s.platform === "mscopilot" ? "copilot" : s.platform;
      return selectedAgents.includes(key);
    });
  }, [sortedSessions, selectedAgents]);

  // When a search is active and the LLM has returned sources, show only those in the sidebar
  const sidebarSessions = useMemo(() => {
    if (!searchKeyword.trim() || aiSources.length === 0) return filteredSessions;
    const ids = new Set(aiSources.map((s) => s.convId ?? s.id));
    return filteredSessions.filter((s) => ids.has(s.id));
  }, [filteredSessions, searchKeyword, aiSources]);

  const activeSession = sessions.find((s) => s.id === activeId);

  let content: React.ReactNode;
  if (stage === "loading") {
    content = <div className="min-h-screen w-full" style={{ background: "var(--bg-deep)" }} />;
  } else if (stage === "auth") {
    content = <AuthScreen onAuthenticated={handleAuthenticated} />;
  } else if (stage === "select-agents") {
    content = <AgentSelectScreen initialSelected={selectedAgents} onContinue={handleAgentsSelected} />;
  } else {
    content = (
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-deep)", width: "100vw" }}>
        {/* Left sidebar */}
        <Sidebar
          sessions={sidebarSessions}
          activeId={activeId}
          onSelect={handleSelect}
          onNewChat={handleNewChat}
          isMobileOpen={isMobileOpen}
          onMobileClose={() => setIsMobileOpen(false)}
          userEmail={userEmail ?? undefined}
          agentCount={selectedAgents.length}
          selectedAgents={selectedAgents}
          onChangeAgents={() => setAuth((prev) => ({ ...prev, stage: "select-agents" }))}
          onLogout={handleLogout}
          sessionsLoading={sessionsLoading}
        />

        {/* Center — Brain Graph or Chat, toggled by session selection */}
        {centerView === "chat" && activeSession ? (
          <ChatArea
            messages={activeSession.messages}
            isTyping={isTyping}
            onSend={handleSend}
            onSuggest={handleSuggest}
            onExplore={(label) => setSearchKeyword(label)}
            onClear={handleClear}
            onMenuClick={() => setIsMobileOpen(true)}
            onGraphView={() => setCenterView("graph")}
          />
        ) : (
          <GraphCenter
            searchKeyword={searchKeyword}
            searchTriggerKey={searchTriggerKey}
            onAiSourcesChange={setAiSources}
            onAiAnswerReady={handleAiAnswerReady}
            onAiLoadingChange={handleMemorySearchLoadingChange}
            onResultsPanelContentChange={setResultsPanelContent}
            panelResetKey={panelResetKey}
            sessions={filteredSessions}
            sessionsLoading={sessionsLoading}
            selectedAgents={selectedAgents}
          />
        )}

        {/* Right panel — search + history */}
        <RightPanel
          searchKeyword={searchKeyword}
          onSearchChange={setSearchKeyword}
          onSearchSubmit={handleMemorySearchSubmit}
          onOpenPanel={() => setPanelResetKey((k) => k + 1)}
          searchHistory={searchHistory}
          onHistoryUpdate={handleHistoryUpdate}
          onForgetPast={handleForgetPast}
          isSearchLoading={isMemorySearchLoading}
          resultsPanelContent={resultsPanelContent}
        />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: "easeInOut" }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
