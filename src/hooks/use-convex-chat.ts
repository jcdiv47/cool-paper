"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useMutation, useAction, useConvex } from "convex/react";
import { useStreamingUIMessages } from "@convex-dev/agent/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ThreadMessage } from "@/types";
import { DEFAULT_MODEL } from "@/lib/models";
import { parseThinkTags } from "../../convex/lib/modelConfig";

export interface UseConvexChatReturn {
  messages: ThreadMessage[];
  streamingMessage: ThreadMessage | null;
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
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [paperIds, setPaperIds] = useState<string[]>([]);
  const [model, setModelRaw] = useState<string>(DEFAULT_MODEL);
  const modelOverrideRef = useRef(false);
  const abortRef = useRef(false);

  // Wrap setModel so user-initiated changes take priority over server sync
  const setModel = useCallback((newModel: string) => {
    modelOverrideRef.current = true;
    setModelRaw(newModel);
  }, []);

  const convex = useConvex();
  const createThreadMut = useMutation(api.threads.create);
  const addUserMessageMut = useMutation(api.messages.addUserMessage);
  const updatePapersMut = useMutation(api.threads.updatePapers);
  const startChatAction = useAction(api.actions.chat.startChat);
  const cancelChatMut = useMutation(api.threads.cancelChat);

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

  // Server-authoritative streaming state
  const isStreaming = convexThread?.chatStatus === "generating";

  const agentThreadId = convexThread?.agentThreadId;

  // Subscribe to streaming deltas from the agent component
  const streamingUIMessages = useStreamingUIMessages(
    api.agentStreams.getStreams as Parameters<typeof useStreamingUIMessages>[0],
    agentThreadId && isStreaming ? { threadId: agentThreadId } : "skip",
  );

  const messages = useMemo<ThreadMessage[]>(
    () =>
      (convexMessages ?? [])
        .filter((m) => !m.isPartial)
        .map((m) => ({
          role: m.role,
          content: m.content,
          thinking: m.thinking,
          timestamp: m.timestamp,
          model: m.model,
        })),
    [convexMessages]
  );

  // Build streaming message from agent UIMessages (real-time text + thinking).
  // persistChatResult clears chatStatus and inserts the message atomically,
  // so there is no gap to bridge when isStreaming flips to false.
  const streamingMessage = useMemo<ThreadMessage | null>(() => {
    if (!isStreaming) return null;

    if (streamingUIMessages?.length) {
      const assistantMsgs = streamingUIMessages.filter(
        (m) => m.role === "assistant"
      );
      const lastAssistant = assistantMsgs[assistantMsgs.length - 1];

      if (lastAssistant) {
        let rawText = "";
        let structuredThinking = "";

        for (const part of lastAssistant.parts) {
          if (part.type === "text") {
            rawText += (part as { type: "text"; text: string }).text;
          } else if (part.type === "reasoning") {
            const rp = part as { type: "reasoning"; text: string };
            structuredThinking += (structuredThinking ? "\n" : "") + rp.text;
          }
        }

        const { thinking: tagThinking, content: cleanText } =
          parseThinkTags(rawText);

        return {
          role: "assistant" as const,
          content: cleanText,
          thinking: structuredThinking || tagThinking || undefined,
          timestamp: new Date().toISOString(),
          model,
        };
      }
    }

    // Waiting for first deltas (draft pass running, or gap between passes)
    return {
      role: "assistant" as const,
      content: "",
      timestamp: new Date().toISOString(),
      model,
    };
  }, [isStreaming, streamingUIMessages, model]);

  // Derive isThinking from streaming content:
  // true when streaming but no text content has appeared yet
  const isThinking = useMemo(() => {
    if (!isStreaming) return false;
    if (!streamingUIMessages?.length) return true;

    const assistantMsgs = streamingUIMessages.filter(
      (m) => m.role === "assistant"
    );
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    if (!lastAssistant) return true;

    // Collect raw text from all text parts
    let rawText = "";
    for (const p of lastAssistant.parts) {
      if (p.type === "text") {
        rawText += (p as { type: "text"; text: string }).text;
      }
    }
    // Strip <think> tags — the remaining content is "real" text
    const { content } = parseThinkTags(rawText);
    return !content;
  }, [isStreaming, streamingUIMessages]);

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
      const thread = await convex.query(api.threads.get, {
        id: id as Id<"threads">,
      });
      if (!thread) throw new Error("Thread not found");
      setThreadId(id);
    },
    [convex]
  );

  // Sync paperIds from loaded thread
  useEffect(() => {
    if (convexThread) {
      setPaperIds(convexThread.paperIds);
      if (convexThread.model && !modelOverrideRef.current) {
        setModelRaw(convexThread.model);
      }
    }
  }, [convexThread]);

  // Clear override once streaming finishes (server now has the correct model)
  useEffect(() => {
    if (!isStreaming) {
      modelOverrideRef.current = false;
    }
  }, [isStreaming]);

  const clearThread = useCallback(() => {
    setThreadId(null);
    setPaperIds([]);
    setError(null);
    modelOverrideRef.current = false;
    setModelRaw(DEFAULT_MODEL);
  }, []);

  const addPaper = useCallback(
    async (paperId: string) => {
      if (isStreaming) return;
      const newIds = [...paperIds, paperId];
      if (threadId) {
        await updatePapersMut({
          id: threadId as Id<"threads">,
          paperIds: newIds,
        });
      }
      setPaperIds(newIds);
    },
    [threadId, paperIds, isStreaming, updatePapersMut]
  );

  const removePaper = useCallback(
    async (paperId: string) => {
      if (isStreaming) return;
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
    [threadId, paperIds, isStreaming, updatePapersMut]
  );

  // Merge async workflow errors into local error state
  const chatError = convexThread?.chatError;
  const mergedError = error || chatError || null;

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;
      if (!threadId && paperIds.length === 0) return;

      setError(null);
      abortRef.current = false;

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

      try {
        // Persist the user turn before invoking the agent.
        const timestamp = new Date().toISOString();
        await addUserMessageMut({
          threadId: activeThreadId as Id<"threads">,
          content: content.trim(),
          timestamp,
        });

        // Kick off the workflow (returns immediately)
        await startChatAction({
          threadId: activeThreadId as Id<"threads">,
          message: content.trim(),
          model,
        });
      } catch (e) {
        if (!abortRef.current) {
          setError(e instanceof Error ? e.message : "Failed to send message");
        }
      }
    },
    [
      threadId,
      paperIds,
      isStreaming,
      model,
      createThread,
      addUserMessageMut,
      startChatAction,
    ]
  );

  const cancelStream = useCallback(() => {
    abortRef.current = true;
    if (threadId) {
      cancelChatMut({ id: threadId as Id<"threads"> }).catch(() => {
        // Cancel is best-effort; mutation failure is non-critical
      });
    }
  }, [threadId, cancelChatMut]);

  return {
    messages,
    streamingMessage,
    isStreaming,
    isThinking,
    error: mergedError,
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
