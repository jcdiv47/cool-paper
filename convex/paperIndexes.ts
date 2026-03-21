import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const sectionOutlineEntryValidator = v.object({
  title: v.string(),
  startPage: v.number(),
});

const paperIndexDocValidator = v.object({
  _id: v.id("paper_indexes"),
  _creationTime: v.number(),
  paperId: v.id("papers"),
  version: v.number(),
  extractorVersion: v.string(),
  createdAt: v.string(),
  sectionOutline: v.optional(v.array(sectionOutlineEntryValidator)),
});

export const getByPaperVersion = query({
  args: { paperId: v.id("papers"), version: v.number() },
  returns: v.union(paperIndexDocValidator, v.null()),
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
  returns: v.union(paperIndexDocValidator, v.null()),
  handler: async (ctx, { paperId }) => {
    const paper = await ctx.db.get(paperId);
    if (!paper || paper.activeIndexVersion === undefined) return null;
    const activeIndexVersion = paper.activeIndexVersion;

    return await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", paperId).eq("version", activeIndexVersion)
      )
      .first();
  },
});

export const getSectionOutline = query({
  args: { paperId: v.id("papers") },
  returns: v.array(sectionOutlineEntryValidator),
  handler: async (ctx, { paperId }) => {
    const paper = await ctx.db.get(paperId);
    if (!paper || paper.activeIndexVersion === undefined) return [];
    const activeIndexVersion = paper.activeIndexVersion;

    const index = await ctx.db
      .query("paper_indexes")
      .withIndex("by_paperId_version", (q) =>
        q.eq("paperId", paperId).eq("version", activeIndexVersion)
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
  returns: v.id("paper_indexes"),
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
  returns: v.union(v.id("paper_indexes"), v.null()),
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
