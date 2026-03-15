import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("papers")
      .withIndex("by_addedAt")
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { sanitizedId: v.string() },
  handler: async (ctx, { sanitizedId }) => {
    return await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("papers") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    arxivId: v.string(),
    sanitizedId: v.string(),
    title: v.string(),
    authors: v.array(v.string()),
    abstract: v.string(),
    published: v.string(),
    categories: v.array(v.string()),
    addedAt: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if paper already exists
    const existing = await ctx.db
      .query("papers")
      .withIndex("by_arxivId", (q) => q.eq("arxivId", args.arxivId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("papers", args);
  },
});

export const remove = mutation({
  args: { id: v.id("papers") },
  handler: async (ctx, { id }) => {
    const paper = await ctx.db.get(id);
    if (!paper) return;

    // Cascade delete notes
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_paperId", (q) => q.eq("paperId", id))
      .collect();
    for (const note of notes) {
      await ctx.db.delete(note._id);
    }

    // Cascade delete jobs and their events
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", paper.sanitizedId)
      )
      .collect();
    for (const job of jobs) {
      const events = await ctx.db
        .query("job_events")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .collect();
      for (const event of events) {
        await ctx.db.delete(event._id);
      }
      await ctx.db.delete(job._id);
    }

    await ctx.db.delete(id);
  },
});

export const removeBySanitizedId = mutation({
  args: { sanitizedId: v.string() },
  handler: async (ctx, { sanitizedId }) => {
    const paper = await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();
    if (!paper) return;

    // Cascade delete notes
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_paperId", (q) => q.eq("paperId", paper._id))
      .collect();
    for (const note of notes) {
      await ctx.db.delete(note._id);
    }

    // Cascade delete jobs and their events
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedId)
      )
      .collect();
    for (const job of jobs) {
      const events = await ctx.db
        .query("job_events")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .collect();
      for (const event of events) {
        await ctx.db.delete(event._id);
      }
      await ctx.db.delete(job._id);
    }

    await ctx.db.delete(paper._id);
  },
});
