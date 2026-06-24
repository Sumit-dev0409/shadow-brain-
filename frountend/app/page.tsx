"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { RightPanel, SearchRecord } from "./components/RightPanel";
import { GraphCenter } from "./components/GraphCenter";
import { AuthScreen } from "./components/AuthScreen";
import { AgentSelectScreen } from "./components/AgentSelectScreen";
import { ChatSession } from "./types";
import { generateId } from "./lib/utils";
import {
  clearSelectedAgents,
  clearSession,
  getSelectedAgents,
  getSession,
  setSelectedAgents,
} from "./lib/auth";

type Stage = "loading" | "auth" | "select-agents" | "app";

interface BackendConversation {
  _id: string;
  title: string;
  platform: string;
  messages: { role: string; content: string; timestamp: string }[];
  createdAt: string;
  updatedAt?: string;
}

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

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchHistory, setSearchHistory] = useState<SearchRecord[]>([]);

  // On first mount, sync local state with whatever was previously saved
  // to localStorage (an external system), restoring the user's session.
  // This is a one-time hydration read, not state derived from props/state,
  // so the react-hooks/set-state-in-effect rule's warning doesn't apply here.
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

  // Fetch scraped conversations from backend when the app is ready
  useEffect(() => {
    if (stage !== "app") return;
    fetch("/api/conversations?limit=50")
      .then((r) => r.json())
      .then((data: BackendConversation[]) => {
        if (!Array.isArray(data)) return;
        const mapped: ChatSession[] = data.map((c) => ({
          id: c._id,
          title: c.title || "Untitled conversation",
          messages: (c.messages ?? []).map((m) => ({
            id: generateId(),
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
            timestamp: new Date(m.timestamp),
          })),
          createdAt: new Date(c.createdAt),
          lastMessageAt: new Date(c.updatedAt ?? c.createdAt),
        }));
        setSessions(mapped);
        if (mapped.length > 0) setActiveId(mapped[0].id);
      })
      .catch(() => {
        // Backend not reachable — leave sidebar empty
      });
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

  const handleNodeSelect = useCallback((nodeId: number, keyword: string) => {
    // Create a new session with the selected node's keyword
    const newSession: ChatSession = {
      id: generateId(),
      title: `History: ${keyword}`,
      messages: [
        {
          id: generateId(),
          role: "assistant",
          content: `Showing memory history for "${keyword}" (Node #${nodeId}). Click back to explore the graph further.`,
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      lastMessageAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveId(newSession.id);
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
      <GraphCenter searchKeyword={searchKeyword} onNodeSelect={handleNodeSelect} />

      {/* Right panel — search + recommendations */}
      <RightPanel
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        searchHistory={searchHistory}
        onHistoryUpdate={handleHistoryUpdate}
      />
    </div>
  );
}
