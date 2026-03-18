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
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [paperIds, setPaperIds] = useState<string[]>([]);
  const [model, setModelRaw] = useState<string>(DEFAULT_MODEL);
  const modelOverrideRef = useRef(false);
  const abortRef = useRef(false);
  const lastStreamRef = useRef<ThreadMessage | null>(null);

  // Wrap setModel so user-initiated changes take priority over server sync
  const setModel = useCallback((newModel: string) => {
    modelOverrideRef.current = true;
    setModelRaw(newModel);
  }, []);

  const convex = useConvex();
  const createThreadMut = useMutation(api.threads.create);
  const addUserMessageMut = useMutation(api.messages.addUserMessage);
  const updatePapersMut = useMutation(api.threads.updatePapers);
  const chatAction = useAction(api.actions.chat.sendMessage);

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

  const agentThreadId = convexThread?.agentThreadId;

  // Subscribe to streaming deltas from the agent component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamingUIMessages = useStreamingUIMessages(
    api.agentStreams.getStreams as any,
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

  // Build streaming message from agent UIMessages (real-time text + thinking)
  const streamingMessage = useMemo<ThreadMessage | null>(() => {
    if (!isStreaming) {
      lastStreamRef.current = null;
      return null;
    }

    if (streamingUIMessages?.length) {
      // Find the last assistant message in the stream
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

        // Parse <think> tags from text (Qwen, DeepSeek, etc.)
        const { thinking: tagThinking, content: cleanText } =
          parseThinkTags(rawText);

        const msg: ThreadMessage = {
          role: "assistant",
          content: cleanText,
          thinking: structuredThinking || tagThinking || undefined,
          timestamp: new Date().toISOString(),
          model,
        };

        lastStreamRef.current = msg;
        return msg;
      }
    }

    // Use last known content (bridges gap between stream end and message save)
    // or show empty placeholder while waiting for first deltas
    return lastStreamRef.current ?? {
      role: "assistant",
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
      abortRef.current = false;

      try {
        // Call the Convex action which runs the agent with streaming
        await chatAction({
          threadId: activeThreadId as Id<"threads">,
          message: content.trim(),
          model,
        });
      } catch (e) {
        if (!abortRef.current) {
          setError(e instanceof Error ? e.message : "Failed to send message");
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [
      threadId,
      paperIds,
      isStreaming,
      model,
      createThread,
      addUserMessageMut,
      chatAction,
    ]
  );

  const cancelStream = useCallback(() => {
    abortRef.current = true;
    setIsStreaming(false);
  }, []);

  return {
    messages,
    streamingMessage,
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
