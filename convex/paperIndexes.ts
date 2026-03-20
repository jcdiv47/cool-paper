import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const sectionOutlineEntryValidator = v.object({
  title: v.string(),
  startPage: v.number(),
});

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

export const getSectionOutline = query({
  args: { paperId: v.id("papers") },
  returns: v.array(sectionOutlineEntryValidator),
  handler: async (ctx, { paperId }) => {
    const paper = await ctx.db.get(paperId);
    if (!paper?.activeIndexVersion) return [];

    const index = await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", paperId).eq("version", paper.activeIndexVersion!)
      )
      .first();

    return index?.sectionOutline ?? [];
  },
});

export const create = mutation({
  args: {
    paperId: v.id("papers"),
    version: v.number(),
    extractorVersion: v.string(),
    createdAt: v.string(),
    sectionOutline: v.optional(v.array(sectionOutlineEntryValidator)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", args.paperId).eq("version", args.version)
      )
      .first();

    if (existing) {
      if (args.sectionOutline !== undefined) {
        await ctx.db.patch(existing._id, {
          sectionOutline: args.sectionOutline,
        });
      }
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
