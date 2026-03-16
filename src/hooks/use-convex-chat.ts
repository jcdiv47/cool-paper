"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ThreadMessage } from "@/types";
import { DEFAULT_MODEL } from "@/lib/models";

export interface UseConvexChatReturn {
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

export function useConvexChat(): UseConvexChatReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [paperIds, setPaperIds] = useState<string[]>([]);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const abortRef = useRef<AbortController | null>(null);
  const hadPartialRef = useRef(false);

  // Convex client for imperative queries
  const convex = useConvex();

  // Convex mutations
  const createThreadMut = useMutation(api.threads.create);
  const addUserMessageMut = useMutation(api.messages.addUserMessage);
  const updatePapersMut = useMutation(api.threads.updatePapers);

  // Subscribe to messages for current thread
  const convexMessages = useQuery(
    api.messages.listByThread,
    threadId ? { threadId: threadId as Id<"threads"> } : "skip"
  );

  // Subscribe to thread data
  const convexThread = useQuery(
    api.threads.get,
    threadId ? { id: threadId as Id<"threads"> } : "skip"
  );

  // Map Convex messages to ThreadMessage shape
  const messages: ThreadMessage[] = (convexMessages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
    thinking: m.thinking,
    timestamp: m.timestamp,
    model: m.model,
  }));

  // Detect streaming state from partial messages.
  // Only turn off streaming after we've seen a partial message get finalized —
  // otherwise the effect fires prematurely when the user message arrives but
  // the assistant partial hasn't been created yet.
  useEffect(() => {
    if (!isStreaming) {
      hadPartialRef.current = false;
      return;
    }
    if (!convexMessages) return;
    const hasPartial = convexMessages.some(
      (m) => m.role === "assistant" && m.isPartial === true
    );
    if (hasPartial) {
      hadPartialRef.current = true;
      // Once the partial message has visible content, the model has moved
      // past the thinking phase into content generation.
      if (isThinking) {
        const partial = convexMessages.find(
          (m) => m.role === "assistant" && m.isPartial === true
        );
        if (partial && partial.content) {
          setIsThinking(false);
        }
      }
    }
    if (!hasPartial && hadPartialRef.current) {
      // Partial was present before but now finalized
      setIsStreaming(false);
      setIsThinking(false);
      hadPartialRef.current = false;
    }
  }, [convexMessages, isStreaming]);

  const createThread = useCallback(
    async (pIds: string[]): Promise<string> => {
      const now = new Date().toISOString();
      const id = await createThreadMut({
        title: "New chat",
        paperIds: pIds,
        createdAt: now,
        updatedAt: now,
      });
      setThreadId(id);
      setPaperIds(pIds);
      setError(null);
      return id;
    },
    [createThreadMut]
  );

  const loadThread = useCallback(
    async (id: string) => {
      setError(null);
      // Verify the thread exists before subscribing
      const thread = await convex.query(api.threads.get, {
        id: id as Id<"threads">,
      });
      if (!thread) {
        throw new Error("Thread not found");
      }
      setThreadId(id);
    },
    [convex]
  );

  // Sync paperIds from loaded thread
  useEffect(() => {
    if (convexThread) {
      setPaperIds(convexThread.paperIds);
      if (convexThread.model) setModel(convexThread.model);
    }
  }, [convexThread]);

  const clearThread = useCallback(() => {
    setThreadId(null);
    setPaperIds([]);
    setError(null);
    setModel(DEFAULT_MODEL);
  }, []);

  const addPaper = useCallback(
    async (paperId: string) => {
      const newIds = [...paperIds, paperId];
      if (threadId) {
        await updatePapersMut({
          id: threadId as Id<"threads">,
          paperIds: newIds,
        });
      }
      setPaperIds(newIds);
    },
    [threadId, paperIds, updatePapersMut]
  );

  const removePaper = useCallback(
    async (paperId: string) => {
      if (paperIds.length <= 1) return;
      const newIds = paperIds.filter((id) => id !== paperId);
      if (threadId) {
        await updatePapersMut({
          id: threadId as Id<"threads">,
          paperIds: newIds,
        });
      }
      setPaperIds(newIds);
    },
    [threadId, paperIds, updatePapersMut]
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

      // Add user message to Convex
      const timestamp = new Date().toISOString();
      await addUserMessageMut({
        threadId: activeThreadId as Id<"threads">,
        content: content.trim(),
        timestamp,
      });

      setIsStreaming(true);
      setIsThinking(true);

      abortRef.current = new AbortController();

      try {
        // Call the API route which runs the agent and writes partial messages to Convex
        const res = await fetch(
          `/api/threads/${activeThreadId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: content.trim(), model }),
            signal: abortRef.current.signal,
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          setError(err.error || "Failed to send message");
        }
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          setError(e.message);
        }
      } finally {
        setIsStreaming(false);
        setIsThinking(false);
      }
    },
    [threadId, paperIds, isStreaming, model, createThread, addUserMessageMut]
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
