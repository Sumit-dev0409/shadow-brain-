"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { RightPanel, SearchRecord } from "./components/RightPanel";
import { GraphCenter } from "./components/GraphCenter";
import { AuthScreen } from "./components/AuthScreen";
import { AgentSelectScreen } from "./components/AgentSelectScreen";
import { ChatSession } from "./types";
import { generateId, INITIAL_SESSIONS } from "./lib/utils";
import {
  clearSelectedAgents,
  clearSession,
  getSelectedAgents,
  getSession,
  setSelectedAgents,
} from "./lib/auth";

type Stage = "loading" | "auth" | "select-agents" | "app";

interface AuthState {
  stage: Stage;
  userEmail: string | null;
  selectedAgents: string[];
}

export default function Home() {
  const [auth, setAuth] = useState<AuthState>({
    stage: "loading",
    userEmail: null,
    selectedAgents: [],
  });
  const { stage, userEmail, selectedAgents } = auth;

  const [sessions, setSessions] = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeId, setActiveId] = useState<string>(INITIAL_SESSIONS[0].id);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchHistory, setSearchHistory] = useState<SearchRecord[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setIsMobileOpen(false);
  }, []);

  const handleHistoryUpdate = useCallback((record: SearchRecord) => {
    setSearchHistory((prev) => {
      const filtered = prev.filter((r) => r.keyword !== record.keyword);
      return [record, ...filtered];
    });
  }, []);

  // Forget all past search history
  const handleForgetPast = useCallback(() => {
    setSearchHistory([]);
    setSearchKeyword("");
  }, []);

  if (stage === "loading") {
    return <div className="min-h-screen w-full" style={{ background: "var(--bg-deep)" }} />;
  }

  if (stage === "auth") {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  if (stage === "select-agents") {
    return <AgentSelectScreen initialSelected={selectedAgents} onContinue={handleAgentsSelected} />;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-deep)" }}>
      {/* Left sidebar */}
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
        userEmail={userEmail ?? undefined}
        agentCount={selectedAgents.length}
        onChangeAgents={() => setAuth((prev) => ({ ...prev, stage: "select-agents" }))}
        onLogout={handleLogout}
      />

      {/* Center — Obsidian brain graph */}
      <GraphCenter
        searchKeyword={searchKeyword}
        sessions={sessions}
      />

      {/* Right panel — search + history */}
      <RightPanel
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        searchHistory={searchHistory}
        onHistoryUpdate={handleHistoryUpdate}
        onForgetPast={handleForgetPast}
      />
    </div>
  );
}
