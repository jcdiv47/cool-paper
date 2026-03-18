import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const jobType = v.union(
  v.literal("paper-import"),
  v.literal("paper-delete")
);

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
  handler: async (ctx, { sanitizedPaperId, excludeJobId }) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .collect();

    return jobs.filter((job) => {
      if (excludeJobId && job._id === excludeJobId) return false;
      return job.status === "pending" || job.status === "running";
    });
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
