"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, SendHorizontal, Bot, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function TypingIndicator() {
  return (
    <div className="mr-auto max-w-[80%] rounded-lg bg-muted px-3 py-2">
      <div className="flex items-center gap-1">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 duration-200",
        isUser ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"
      )}
    >
      {!isUser && (
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="size-3" />
          <span>CloudOps AI</span>
        </div>
      )}
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: generateId(),
      role: "assistant",
      content:
        "Hello! I'm CloudOps AI. I can help you manage your infrastructure, analyze metrics, troubleshoot issues, and more. What would you like to do?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const closeChat = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeChat, isOpen]);

  const sendMessage = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Failed to get response");
      }

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error("Chat error", { description: message });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, [inputValue, isLoading, messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-[70] flex max-h-[calc(100vh-7rem)] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 sm:right-6">
          {/* Header */}
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Bot className="size-5" />
              <span className="text-sm font-semibold">CloudOps AI</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              aria-label="Close CloudOps AI chat"
              onClick={closeChat}
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ height: 432 }}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 border-t p-3">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask CloudOps AI..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
            >
              <SendHorizontal className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Trigger Button */}
      {!isOpen && (
        <Button
          size="icon-lg"
          onClick={() => setIsOpen(true)}
          type="button"
          aria-label="Open CloudOps AI chat"
          className="fixed bottom-6 right-6 z-[70] size-14 rounded-full shadow-lg transition-transform hover:scale-105"
        >
          <MessageSquare className="size-6" />
        </Button>
      )}
    </>
  );
}
