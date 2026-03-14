"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { TaskType } from "@/lib/agent";

export interface GenerateJobState {
  generating: boolean;
  output: string;
  cliCommand: string;
}

export function useGenerateJob(
  paperId: string,
  onGenerated: () => void
) {
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [cliCommand, setCliCommand] = useState("");
  const sseAbortRef = useRef<AbortController | null>(null);

  const connectToStream = useCallback(
    (reset: boolean) => {
      // Abort any existing SSE connection
      sseAbortRef.current?.abort();

      const controller = new AbortController();
      sseAbortRef.current = controller;

      if (reset) {
        setOutput("");
        setCliCommand("");
      }
      setGenerating(true);

      (async () => {
        try {
          const res = await fetch(
            `/api/papers/${encodeURIComponent(paperId)}/notes/generation?stream`,
            { signal: controller.signal }
          );

          if (!res.ok) {
            setGenerating(false);
            return;
          }

          const reader = res.body?.getReader();
          if (!reader) {
            setGenerating(false);
            return;
          }

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
                if (data.type === "command") {
                  setCliCommand(data.command);
                } else if (data.type === "stdout") {
                  setOutput((prev) => prev + data.text);
                } else if (data.type === "stderr") {
                  setOutput((prev) => prev + data.text);
                } else if (data.type === "error") {
                  setOutput((prev) => prev + "\n[Error] " + data.message);
                } else if (data.type === "done") {
                  if (data.exitCode === 0) {
                    onGenerated();
                  } else if (data.exitCode !== null) {
                    setOutput(
                      (prev) =>
                        prev + `\n[Process exited with code ${data.exitCode}]`
                    );
                  }
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        } catch (e) {
          if (e instanceof Error && e.name !== "AbortError") {
            setOutput((prev) => prev + "\nError: " + e.message);
          }
        } finally {
          setGenerating(false);
        }
      })();
    },
    [paperId, onGenerated]
  );

  // On mount: check for active generation and reconnect
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/papers/${encodeURIComponent(paperId)}/notes/generation`
        );
        if (!res.ok || cancelled) return;

        const status = await res.json();
        if (status.active && !cancelled) {
          connectToStream(false);
        }
      } catch {
        // Ignore - no active generation
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paperId, connectToStream]);

  const startJob = useCallback(
    async (prompt: string, noteFilename: string, taskType?: TaskType, model?: string) => {
      if (!prompt.trim()) return;

      setGenerating(true);
      setOutput("");
      setCliCommand("");

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperId,
            prompt: prompt.trim(),
            noteFilename,
            taskType,
            model,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          if (res.status === 409) {
            // Already running, connect to existing stream
            connectToStream(false);
            return;
          }
          setOutput(`Error: ${err.error || "Failed to start generation"}`);
          setGenerating(false);
          return;
        }

        // Job started, connect to the SSE stream
        connectToStream(true);
      } catch (e) {
        setOutput(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
        setGenerating(false);
      }
    },
    [paperId, connectToStream]
  );

  const cancelJob = useCallback(async () => {
    // Disconnect SSE
    sseAbortRef.current?.abort();
    sseAbortRef.current = null;

    // Cancel the server-side agent
    try {
      await fetch(
        `/api/papers/${encodeURIComponent(paperId)}/notes/generation`,
        { method: "DELETE" }
      );
    } catch {
      // Best effort
    }

    setGenerating(false);
  }, [paperId]);

  // Cleanup SSE on unmount (does not kill the agent)
  useEffect(() => {
    return () => {
      sseAbortRef.current?.abort();
    };
  }, []);

  return {
    generating,
    output,
    cliCommand,
    startJob,
    cancelJob,
  };
}
