"use client";

import { useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Message } from "@/app/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { WelcomeScreen } from "./WelcomeScreen";
import { ChatInput } from "./ChatInput";
import { TopBar } from "./TopBar";

interface ChatAreaProps {
  messages: Message[];
  isTyping: boolean;
  onSend: (text: string) => void;
  onSuggest: (text: string) => void;
  onExplore?: (label: string) => void;
  onClear: () => void;
  onMenuClick: () => void;
  onGraphView?: () => void;
}

export function ChatArea({
  messages,
  isTyping,
  onSend,
  onSuggest,
  onExplore,
  onClear,
  onMenuClick,
  onGraphView,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col h-screen flex-1 min-w-0" style={{ background: "var(--bg-deep)" }}>
      <TopBar onMenuClick={onMenuClick} onClear={onClear} onGraphView={onGraphView} />

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !isTyping ? (
          <WelcomeScreen onSuggest={onSuggest} />
        ) : (
          <div className="flex flex-col gap-5 px-4 sm:px-6 py-8">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onExplore={onExplore} />
              ))}
              {isTyping && <TypingIndicator key="typing" />}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <ChatInput onSend={onSend} disabled={isTyping} />
    </div>
  );
}
