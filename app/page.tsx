"use client";

import { useState, useCallback, useEffect } from "react";
import { Sidebar }  from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { Message, ChatSession } from "./types";
import { generateId, getAIResponse, fetchConversations } from "./lib/utils";

export default function Home() {
  const [sessions,     setSessions]     = useState<ChatSession[]>([]);
  const [activeId,     setActiveId]     = useState<string>("");
  const [isTyping,     setIsTyping]     = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isLoading,    setIsLoading]    = useState(true);

  const activeSession = sessions.find((s) => s.id === activeId);

  // ── Load captured conversations from MongoDB on mount ────
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const loaded = await fetchConversations();
      if (loaded.length > 0) {
        setSessions(loaded);
        setActiveId(loaded[0].id);
      } else {
        // No backend data yet — start with an empty new chat
        const empty = makeNewSession();
        setSessions([empty]);
        setActiveId(empty.id);
      }
      setIsLoading(false);
    })();
  }, []);

  // ── Helpers ───────────────────────────────────────────────
  function makeNewSession(): ChatSession {
    return {
      id:            generateId(),
      title:         "New conversation",
      messages:      [],
      createdAt:     new Date(),
      lastMessageAt: new Date(),
    };
  }

  // ── Send message ──────────────────────────────────────────
  const handleSend = useCallback(
    async (text: string) => {
      if (isTyping || !activeId) return;

      const userMsg: Message = {
        id:        generateId(),
        role:      "user",
        content:   text,
        timestamp: new Date(),
      };

      const currentHistory = activeSession?.messages ?? [];

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? { ...s, messages: [...s.messages, userMsg], lastMessageAt: new Date(),
                title: s.messages.length === 0 ? text.slice(0, 50) : s.title }
            : s
        )
      );

      setIsTyping(true);

      try {
        // Build system prompt from the conversation's metadata if it was captured
        const session = sessions.find(s => s.id === activeId);
        const systemPrompt = session?.summary
          ? `This conversation was originally captured from ${session.platform || 'an AI platform'}. Topic: ${session.topic || ''}. Summary: ${session.summary}`
          : undefined;

        const content = await getAIResponse(text, currentHistory, systemPrompt);

        const aiMsg: Message = {
          id:        generateId(),
          role:      "assistant",
          content,
          timestamp: new Date(),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeId
              ? { ...s, messages: [...s.messages, aiMsg], lastMessageAt: new Date() }
              : s
          )
        );
      } finally {
        setIsTyping(false);
      }
    },
    [activeId, activeSession, isTyping, sessions]
  );

  // ── New chat ──────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    const s = makeNewSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setIsTyping(false);
  }, []);

  // ── Clear current chat ────────────────────────────────────
  const handleClear = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, messages: [] } : s))
    );
    setIsTyping(false);
  }, [activeId]);

  // ── Refresh from backend ──────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    const loaded = await fetchConversations();
    if (loaded.length > 0) {
      setSessions((prev) => {
        // Keep any new (non-backend) sessions the user started, prepend loaded ones
        const localOnly = prev.filter((s) => !s.isFromBackend);
        return [...loaded, ...localOnly];
      });
    }
    setIsLoading(false);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setIsTyping(false);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-deep)" }}>
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onRefresh={handleRefresh}
        isLoading={isLoading}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />
      <ChatArea
        session={activeSession}
        messages={activeSession?.messages ?? []}
        isTyping={isTyping}
        onSend={handleSend}
        onSuggest={handleSend}
        onClear={handleClear}
        onMenuClick={() => setIsMobileOpen(true)}
      />
    </div>
  );
}
