"use client";

import { useState, useCallback } from "react";
import { Sidebar }     from "./components/Sidebar";
import { ChatArea }    from "./components/ChatArea";
import { Message, ChatSession } from "./types";
import { generateId, getAIResponse, INITIAL_SESSIONS } from "./lib/utils";

export default function Home() {
  const [sessions,      setSessions]      = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeId,      setActiveId]      = useState<string>(INITIAL_SESSIONS[0].id);
  const [isTyping,      setIsTyping]      = useState(false);
  const [isMobileOpen,  setIsMobileOpen]  = useState(false);

  const activeSession = sessions.find((s) => s.id === activeId)!;

  const handleSend = useCallback(
    async (text: string) => {
      if (isTyping) return;

      const userMsg: Message = {
        id:        generateId(),
        role:      "user",
        content:   text,
        timestamp: new Date(),
      };

      // Snapshot the current history before updating state
      const currentHistory = activeSession?.messages ?? [];

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? { ...s, messages: [...s.messages, userMsg], lastMessageAt: new Date() }
            : s
        )
      );

      setIsTyping(true);

      try {
        // Pass conversation history so the AI has context
        const content = await getAIResponse(text, currentHistory);

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
    [activeId, activeSession, isTyping]
  );

  const handleNewChat = useCallback(() => {
    const newSession: ChatSession = {
      id:            generateId(),
      title:         "New conversation",
      messages:      [],
      createdAt:     new Date(),
      lastMessageAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveId(newSession.id);
    setIsTyping(false);
  }, []);

  const handleClear = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, messages: [] } : s))
    );
    setIsTyping(false);
  }, [activeId]);

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
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />
      <ChatArea
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
