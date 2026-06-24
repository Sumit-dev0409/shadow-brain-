"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { Message, ChatSession } from "./types";
import { generateId, getAIResponse, getMemoryGraph, INITIAL_SESSIONS } from "./lib/utils";

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>(INITIAL_SESSIONS);
  const [activeId, setActiveId] = useState<string>(INITIAL_SESSIONS[0].id);
  const [isTyping, setIsTyping] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeId)!;

  const handleSend = useCallback(
    (text: string) => {
      if (isTyping) return;

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? { ...s, messages: [...s.messages, userMsg], lastMessageAt: new Date() }
            : s
        )
      );

      setIsTyping(true);

      const delay = 900 + Math.random() * 700;
      setTimeout(() => {
        const aiMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: getAIResponse(text),
          timestamp: new Date(),
          graph: getMemoryGraph(text),
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeId
              ? { ...s, messages: [...s.messages, aiMsg], lastMessageAt: new Date() }
              : s
          )
        );
        setIsTyping(false);
      }, delay);
    },
    [activeId, isTyping]
  );

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

  const handleExplore = useCallback(
    (label: string) => {
      handleSend(`Tell me more about "${label}".`);
    },
    [handleSend]
  );

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
        onExplore={handleExplore}
        onClear={handleClear}
        onMenuClick={() => setIsMobileOpen(true)}
      />
    </div>
  );
}
