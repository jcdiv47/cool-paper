import { randomUUID } from "crypto";

export interface BufferedEvent {
  id: number;
  data: Record<string, unknown>;
  timestamp: number;
}

export type JobStatus = "running" | "completed" | "failed" | "cancelled";

type Listener = (event: BufferedEvent) => void;

export interface Job {
  jobId: string;
  paperId: string;
  sanitizedId: string;
  noteFilename: string;
  status: JobStatus;
  events: BufferedEvent[];
  abortController: AbortController;
  listeners: Set<Listener>;
}

const MAX_EVENTS = 2000;
const CLEANUP_DELAY_MS = 60_000;

const jobs = new Map<string, Job>();

export function createJob(
  sanitizedId: string,
  paperId: string,
  noteFilename: string
): Job {
  const existing = jobs.get(sanitizedId);
  if (existing && existing.status === "running") {
    throw new Error("Generation already running for this paper");
  }

  const job: Job = {
    jobId: randomUUID(),
    paperId,
    sanitizedId,
    noteFilename,
    status: "running",
    events: [],
    abortController: new AbortController(),
    listeners: new Set(),
  };

  jobs.set(sanitizedId, job);
  return job;
}

export function getJob(sanitizedId: string): Job | undefined {
  return jobs.get(sanitizedId);
}

let eventCounter = 0;

export function pushEvent(
  sanitizedId: string,
  data: Record<string, unknown>
): void {
  const job = jobs.get(sanitizedId);
  if (!job) return;

  const event: BufferedEvent = {
    id: ++eventCounter,
    data,
    timestamp: Date.now(),
  };

  job.events.push(event);
  if (job.events.length > MAX_EVENTS) {
    job.events.shift();
  }

  for (const listener of job.listeners) {
    try {
      listener(event);
    } catch {
      // Listener threw, ignore
    }
  }
}

export function addListener(
  sanitizedId: string,
  cb: Listener
): (() => void) | null {
  const job = jobs.get(sanitizedId);
  if (!job) return null;

  job.listeners.add(cb);
  return () => {
    job.listeners.delete(cb);
  };
}

export function completeJob(
  sanitizedId: string,
  status: "completed" | "failed" | "cancelled"
): void {
  const job = jobs.get(sanitizedId);
  if (!job) return;

  job.status = status;

  setTimeout(() => {
    const current = jobs.get(sanitizedId);
    if (current === job && current.status !== "running") {
      jobs.delete(sanitizedId);
    }
  }, CLEANUP_DELAY_MS);
}

export function cancelJob(sanitizedId: string): boolean {
  const job = jobs.get(sanitizedId);
  if (!job || job.status !== "running") return false;

  job.abortController.abort();
  return true;
}
