"use client";

import { useState, useRef, useCallback } from "react";
import type { ThreadMessage, Thread } from "@/types";
import { DEFAULT_MODEL } from "@/lib/models";

function generateId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UseChatReturn {
  messages: ThreadMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  cancelStream: () => void;
  loadThread: (threadId: string) => Promise<void>;
  clearThread: () => void;
  threadId: string | null;
  model: string;
  setModel: (model: string) => void;
}

export function useChat(paperId: string): UseChatReturn {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const abortRef = useRef<AbortController | null>(null);

  const loadThread = useCallback(
    async (id: string) => {
      setError(null);
      try {
        const res = await fetch(`/api/papers/${paperId}/threads/${id}`);
        if (!res.ok) throw new Error("Failed to load thread");
        const thread: Thread = await res.json();
        setThreadId(thread.id);
        setMessages(thread.messages);
        if (thread.model) setModel(thread.model);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load thread");
      }
    },
    [paperId]
  );

  const clearThread = useCallback(() => {
    setThreadId(null);
    setMessages([]);
    setError(null);
    setModel(DEFAULT_MODEL);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      setError(null);

      // Determine thread ID — create new if none
      const currentThreadId =
        threadId || generateId();
      if (!threadId) {
        setThreadId(currentThreadId);
      }

      // Optimistically append user message
      const userMessage: ThreadMessage = {
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setIsThinking(true);

      abortRef.current = new AbortController();

      // Add a placeholder assistant message for streaming
      const assistantMessage: ThreadMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        model,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const res = await fetch(
          `/api/papers/${paperId}/threads/${currentThreadId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: content.trim(), model }),
            signal: abortRef.current.signal,
          }
        );

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "thinking_delta") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      thinking: (last.thinking || "") + data.thinking,
                    };
                  }
                  return updated;
                });
              } else if (data.type === "thinking_done") {
                setIsThinking(false);
              } else if (data.type === "text_delta") {
                // First text delta also ends thinking (covers non-thinking models)
                setIsThinking(false);
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + data.text,
                    };
                  }
                  return updated;
                });
              } else if (data.type === "error") {
                setError(data.message);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          setError(e.message);
        }
        // On abort, remove the empty assistant message if it has no content
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setIsStreaming(false);
        setIsThinking(false);
      }
    },
    [paperId, threadId, isStreaming, model]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setIsThinking(false);
  }, []);

  return {
    messages,
    isStreaming,
    isThinking,
    error,
    sendMessage,
    cancelStream,
    loadThread,
    clearThread,
    threadId,
    model,
    setModel,
  };
}
