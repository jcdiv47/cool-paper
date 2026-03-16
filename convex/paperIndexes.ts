import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByPaperVersion = query({
  args: { paperId: v.id("papers"), version: v.number() },
  handler: async (ctx, { paperId, version }) => {
    return await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", paperId).eq("version", version)
      )
      .first();
  },
});

export const getActiveForPaper = query({
  args: { paperId: v.id("papers") },
  handler: async (ctx, { paperId }) => {
    const paper = await ctx.db.get(paperId);
    if (!paper?.activeIndexVersion) return null;

    return await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", paperId).eq("version", paper.activeIndexVersion!)
      )
      .first();
  },
});

export const create = mutation({
  args: {
    paperId: v.id("papers"),
    version: v.number(),
    extractorVersion: v.string(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", args.paperId).eq("version", args.version)
      )
      .first();

    if (existing) {
      await ctx.db.patch(args.paperId, { activeIndexVersion: args.version });
      return existing._id;
    }

    const id = await ctx.db.insert("paper_indexes", args);
    await ctx.db.patch(args.paperId, { activeIndexVersion: args.version });
    return id;
  },
});

export const setActiveVersion = mutation({
  args: {
    paperId: v.id("papers"),
    version: v.number(),
  },
  handler: async (ctx, { paperId, version }) => {
    const index = await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", paperId).eq("version", version)
      )
      .first();

    if (!index) return null;

    await ctx.db.patch(paperId, { activeIndexVersion: version });
    return index._id;
  },
});
