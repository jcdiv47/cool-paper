"use client";

import { useState, useRef, useCallback } from "react";

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
  const abortRef = useRef<AbortController | null>(null);

  const startJob = useCallback(
    async (prompt: string, noteFilename: string) => {
      if (!prompt.trim()) return;

      setGenerating(true);
      setOutput("");
      setCliCommand("");

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperId,
            prompt: prompt.trim(),
            noteFilename,
          }),
          signal: abortRef.current.signal,
        });

        const reader = res.body?.getReader();
        if (!reader) return;

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
    },
    [paperId, onGenerated]
  );

  const cancelJob = useCallback(() => {
    abortRef.current?.abort();
    setGenerating(false);
  }, []);

  return {
    generating,
    output,
    cliCommand,
    startJob,
    cancelJob,
  };
}
