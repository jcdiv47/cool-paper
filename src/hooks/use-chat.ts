"use client";

import { useState, useRef, useCallback } from "react";
import type { ThreadMessage, Thread } from "@/types";
import { DEFAULT_MODEL } from "@/lib/models";

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
  paperIds: string[];
  setPaperIds: (ids: string[]) => void;
  addPaper: (id: string) => Promise<void>;
  removePaper: (id: string) => Promise<void>;
  createThread: (paperIds: string[]) => Promise<string>;
  model: string;
  setModel: (model: string) => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [paperIds, setPaperIds] = useState<string[]>([]);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const abortRef = useRef<AbortController | null>(null);

  const createThread = useCallback(async (pIds: string[]): Promise<string> => {
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paperIds: pIds }),
    });
    if (!res.ok) throw new Error("Failed to create thread");
    const thread: Thread = await res.json();
    setThreadId(thread.id);
    setPaperIds(thread.paperIds);
    setMessages([]);
    setError(null);
    return thread.id;
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/threads/${id}`);
      if (!res.ok) throw new Error("Failed to load thread");
      const thread: Thread = await res.json();
      setThreadId(thread.id);
      setMessages(thread.messages);
      setPaperIds(thread.paperIds);
      if (thread.model) setModel(thread.model);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load thread");
    }
  }, []);

  const clearThread = useCallback(() => {
    setThreadId(null);
    setMessages([]);
    setPaperIds([]);
    setError(null);
    setModel(DEFAULT_MODEL);
  }, []);

  const addPaper = useCallback(
    async (paperId: string) => {
      const newIds = [...paperIds, paperId];
      if (threadId) {
        // Thread already persisted — update server
        const res = await fetch(`/api/threads/${threadId}/papers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paperIds: newIds }),
        });
        if (!res.ok) return;
      }
      setPaperIds(newIds);
    },
    [threadId, paperIds]
  );

  const removePaper = useCallback(
    async (paperId: string) => {
      if (paperIds.length <= 1) return;
      const newIds = paperIds.filter((id) => id !== paperId);
      if (threadId) {
        const res = await fetch(`/api/threads/${threadId}/papers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paperIds: newIds }),
        });
        if (!res.ok) return;
      }
      setPaperIds(newIds);
    },
    [threadId, paperIds]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;
      if (!threadId && paperIds.length === 0) return;

      setError(null);

      // Lazily create thread on first message
      let activeThreadId = threadId;
      if (!activeThreadId) {
        try {
          activeThreadId = await createThread(paperIds);
        } catch {
          setError("Failed to create chat");
          return;
        }
      }

      const userMessage: ThreadMessage = {
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setIsThinking(true);

      abortRef.current = new AbortController();

      const assistantMessage: ThreadMessage = {
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        model,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const res = await fetch(
          `/api/threads/${activeThreadId}/messages`,
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
    [threadId, paperIds, isStreaming, model, createThread]
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
    paperIds,
    setPaperIds,
    addPaper,
    removePaper,
    createThread,
    model,
    setModel,
  };
}
