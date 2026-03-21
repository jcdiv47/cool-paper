import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const jobType = v.union(
  v.literal("paper-import"),
  v.literal("paper-delete")
);

const jobStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled")
);

const jobDocValidator = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  type: jobType,
  status: jobStatus,
  sanitizedPaperId: v.string(),
  paperId: v.optional(v.string()),
  model: v.optional(v.string()),
  payload: v.optional(v.string()),
  workerId: v.optional(v.string()),
  startedAt: v.optional(v.string()),
  lastHeartbeatAt: v.optional(v.number()),
  completedAt: v.optional(v.string()),
  cancelRequestedAt: v.optional(v.string()),
  error: v.optional(v.string()),
  displayCommand: v.optional(v.string()),
});

async function requestJobCancellation(
  ctx: MutationCtx,
  job: Doc<"jobs">
) {
  if (job.status !== "running" && job.status !== "pending") {
    return false;
  }

  if (job.status === "pending") {
    await ctx.db.patch(job._id, {
      status: "cancelled",
      cancelRequestedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    return true;
  }

  await ctx.db.patch(job._id, {
    cancelRequestedAt: new Date().toISOString(),
  });
  return true;
}

export const getForPaper = query({
  args: {
    sanitizedPaperId: v.string(),
    type: v.optional(jobType),
  },
  returns: v.union(jobDocValidator, v.null()),
  handler: async (ctx, { sanitizedPaperId, type }) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .order("desc")
      .collect();
    if (type) {
      const filtered = jobs.find((j) => j.type === type);
      return filtered ?? null;
    }
    return jobs[0] ?? null;
  },
});

export const get = query({
  args: { id: v.id("jobs") },
  returns: v.union(jobDocValidator, v.null()),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/** Create a job as running (used by Convex actions for progress tracking) */
export const create = mutation({
  args: {
    type: jobType,
    sanitizedPaperId: v.string(),
    paperId: v.optional(v.string()),
    model: v.optional(v.string()),
    displayCommand: v.optional(v.string()),
  },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("jobs", {
      ...args,
      status: "running",
      startedAt: new Date().toISOString(),
    });
  },
});

/** UI requests cancellation */
export const requestCancel = mutation({
  args: { id: v.id("jobs") },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job) return false;
    return await requestJobCancellation(ctx, job);
  },
});

export const requestCancelForPaper = mutation({
  args: {
    sanitizedPaperId: v.string(),
    excludeJobId: v.optional(v.id("jobs")),
  },
  returns: v.number(),
  handler: async (ctx, { sanitizedPaperId, excludeJobId }) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .collect();

    let cancelled = 0;
    for (const job of jobs) {
      if (excludeJobId && job._id === excludeJobId) continue;
      if (await requestJobCancellation(ctx, job)) {
        cancelled++;
      }
    }

    return cancelled;
  },
});

export const listActiveForPaper = query({
  args: {
    sanitizedPaperId: v.string(),
    excludeJobId: v.optional(v.id("jobs")),
  },
  returns: v.array(jobDocValidator),
  handler: async (ctx, { sanitizedPaperId, excludeJobId }) => {
    const [pending, running] = await Promise.all([
      ctx.db.query("jobs")
        .withIndex("by_sanitizedPaperId_status", (q) =>
          q.eq("sanitizedPaperId", sanitizedPaperId).eq("status", "pending")
        )
        .collect(),
      ctx.db.query("jobs")
        .withIndex("by_sanitizedPaperId_status", (q) =>
          q.eq("sanitizedPaperId", sanitizedPaperId).eq("status", "running")
        )
        .collect(),
    ]);
    const jobs = [...pending, ...running];
    if (excludeJobId) {
      return jobs.filter((job) => job._id !== excludeJobId);
    }
    return jobs;
  },
});

/** Mark job completed */
export const complete = mutation({
  args: {
    id: v.id("jobs"),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    error: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { id, status, error }) => {
    const job = await ctx.db.get(id);
    if (!job) return false;

    await ctx.db.patch(id, {
      status,
      completedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    });
    return true;
  },
});
