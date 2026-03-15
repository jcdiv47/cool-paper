"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { TaskType } from "@/lib/agent";

export function useConvexGenerateJob(
  paperId: string,
  onGenerated: () => void
) {
  const [activeJobId, setActiveJobId] = useState<Id<"jobs"> | null>(null);
  const onGeneratedRef = useRef(onGenerated);
  onGeneratedRef.current = onGenerated;

  // Subscribe to job state for this paper
  const latestJob = useQuery(api.jobs.getForPaper, {
    sanitizedPaperId: paperId,
  });

  // Track whether this job is the one we're watching
  const currentJob =
    activeJobId && latestJob && latestJob._id === activeJobId
      ? latestJob
      : latestJob?.status === "running"
        ? latestJob
        : null;

  // Subscribe to job events when we have an active job
  const jobEvents = useQuery(
    api.jobEvents.listByJob,
    currentJob ? { jobId: currentJob._id } : "skip"
  );

  // Derive state from events
  const generating = currentJob?.status === "running";
  const cliCommand = currentJob?.displayCommand ?? "";

  // Build output from events
  const output = (jobEvents ?? [])
    .map((e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "stdout" || data.type === "stderr") return data.text;
        if (data.type === "error") return "\n[Error] " + data.message;
        if (data.type === "done" && data.exitCode !== 0 && data.exitCode !== null) {
          return `\n[Process exited with code ${data.exitCode}]`;
        }
        return "";
      } catch {
        return "";
      }
    })
    .join("");

  // Detect completion
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!currentJob) return;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = currentJob.status;

    if (prevStatus === "running" && currentJob.status === "completed") {
      onGeneratedRef.current();
      setActiveJobId(null);
    } else if (
      prevStatus === "running" &&
      (currentJob.status === "failed" || currentJob.status === "cancelled")
    ) {
      setActiveJobId(null);
    }
  }, [currentJob]);

  // Re-attach to running job on mount, but verify it's still alive on the server
  useEffect(() => {
    if (latestJob?.status === "running" && !activeJobId) {
      fetch(`/api/papers/${encodeURIComponent(paperId)}/notes/generation`)
        .then((res) => res.json())
        .then((data) => {
          if (data.active) {
            setActiveJobId(latestJob._id);
          }
          // If not active, the GET handler already failed the orphaned job
        })
        .catch(() => {});
    }
  }, [latestJob, activeJobId, paperId]);

  // Periodically verify a running job is still alive on the server.
  // Covers the case where the server restarts after we've already attached:
  // the GET handler detects the missing abort controller and fails the
  // orphaned Convex row, which our subscription then picks up.
  useEffect(() => {
    if (!generating) return;

    const interval = setInterval(() => {
      fetch(`/api/papers/${encodeURIComponent(paperId)}/notes/generation`)
        .catch(() => {});
    }, 15_000);

    return () => clearInterval(interval);
  }, [generating, paperId]);

  const startJob = useCallback(
    async (prompt: string, noteFilename: string, taskType?: TaskType, model?: string) => {
      if (!prompt.trim()) return;

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
          if (res.status === 409 && err.convexJobId) {
            setActiveJobId(err.convexJobId);
            return;
          }
          return;
        }

        const data = await res.json();
        if (data.convexJobId) {
          setActiveJobId(data.convexJobId);
        }
      } catch {
        // Error starting job
      }
    },
    [paperId]
  );

  const cancelJob = useCallback(async () => {
    try {
      await fetch(
        `/api/papers/${encodeURIComponent(paperId)}/notes/generation`,
        { method: "DELETE" }
      );
    } catch {
      // Best effort
    }
  }, [paperId]);

  return {
    generating,
    output,
    cliCommand,
    startJob,
    cancelJob,
  };
}
