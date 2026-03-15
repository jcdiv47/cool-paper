import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getForPaper = query({
  args: { sanitizedPaperId: v.string() },
  handler: async (ctx, { sanitizedPaperId }) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .order("desc")
      .take(1);
    return jobs[0] ?? null;
  },
});

export const get = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    type: v.union(v.literal("note-generation"), v.literal("paper-import")),
    sanitizedPaperId: v.string(),
    paperId: v.optional(v.string()),
    noteFilename: v.optional(v.string()),
    prompt: v.optional(v.string()),
    taskType: v.optional(v.string()),
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
    await ctx.db.patch(id, {
      status,
      completedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    });
  },
});

export const cancel = mutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || job.status !== "running") return false;
    await ctx.db.patch(id, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
    return true;
  },
});
