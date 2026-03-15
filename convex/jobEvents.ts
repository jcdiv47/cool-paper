import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByJob = query({
  args: {
    jobId: v.id("jobs"),
    afterSequence: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, afterSequence }) => {
    if (afterSequence !== undefined) {
      // Only get events after a given sequence number (for incremental updates)
      const events = await ctx.db
        .query("job_events")
        .withIndex("by_jobId_sequence", (q) =>
          q.eq("jobId", jobId).gt("sequenceNumber", afterSequence)
        )
        .collect();
      return events;
    }
    return await ctx.db
      .query("job_events")
      .withIndex("by_jobId_sequence", (q) => q.eq("jobId", jobId))
      .collect();
  },
});

export const push = mutation({
  args: {
    jobId: v.id("jobs"),
    eventType: v.string(),
    data: v.string(),
    sequenceNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("job_events", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
