import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const annotationInput = {
  paperId: v.id("papers"),
  indexVersion: v.number(),
  kind: v.union(v.literal("highlight"), v.literal("note")),
  authorType: v.union(v.literal("user"), v.literal("agent")),
  color: v.optional(v.string()),
  comment: v.optional(v.string()),
  chunkRefId: v.optional(v.string()),
  page: v.number(),
  exact: v.string(),
  prefix: v.optional(v.string()),
  suffix: v.optional(v.string()),
  start: v.optional(v.number()),
  end: v.optional(v.number()),
};

export const listByPaper = query({
  args: { paperId: v.id("papers") },
  handler: async (ctx, { paperId }) => {
    const annotations = await ctx.db
      .query("annotations")
      .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
      .collect();

    annotations.sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return a.createdAt.localeCompare(b.createdAt);
    });

    return annotations;
  },
});

export const getByIdsForPapers = query({
  args: {
    paperIds: v.array(v.id("papers")),
    annotationIds: v.array(v.string()),
  },
  handler: async (ctx, { paperIds, annotationIds }) => {
    const wanted = new Set(annotationIds);
    const matches = [];

    for (const paperId of paperIds) {
      const annotations = await ctx.db
        .query("annotations")
        .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
        .collect();

      for (const annotation of annotations) {
        const annotationId = String(annotation._id);
        if (!wanted.has(annotationId)) continue;
        matches.push({
          ...annotation,
          annotationId,
        });
      }
    }

    return matches;
  },
});

export const resolveBySanitizedId = query({
  args: {
    sanitizedId: v.string(),
    annotationIds: v.array(v.string()),
  },
  handler: async (ctx, { sanitizedId, annotationIds }) => {
    const paper = await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();

    if (!paper) return [];

    const wanted = new Set(annotationIds);
    const annotations = await ctx.db
      .query("annotations")
      .withIndex("by_paperId", (q) => q.eq("paperId", paper._id))
      .collect();

    return annotations
      .filter((annotation) => wanted.has(String(annotation._id)))
      .map((annotation) => ({
        ...annotation,
        annotationId: String(annotation._id),
        sanitizedId,
      }));
  },
});

export const resolveAcrossSanitizedIds = query({
  args: {
    sanitizedIds: v.array(v.string()),
    annotationIds: v.array(v.string()),
  },
  handler: async (ctx, { sanitizedIds, annotationIds }) => {
    const wanted = new Set(annotationIds);
    const results = [];

    for (const sanitizedId of [...new Set(sanitizedIds)]) {
      const paper = await ctx.db
        .query("papers")
        .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
        .first();

      if (!paper) continue;

      const annotations = await ctx.db
        .query("annotations")
        .withIndex("by_paperId", (q) => q.eq("paperId", paper._id))
        .collect();

      for (const annotation of annotations) {
        const annotationId = String(annotation._id);
        if (!wanted.has(annotationId)) continue;
        results.push({
          ...annotation,
          annotationId,
          sanitizedId,
        });
      }
    }

    return results;
  },
});

export const create = mutation({
  args: {
    ...annotationInput,
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("annotations", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("annotations"),
    color: v.optional(v.string()),
    comment: v.optional(v.string()),
    chunkRefId: v.optional(v.string()),
    exact: v.optional(v.string()),
    prefix: v.optional(v.string()),
    suffix: v.optional(v.string()),
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    updatedAt: v.string(),
  },
  handler: async (ctx, { id, ...updates }) => {
    await ctx.db.patch(id, updates);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("annotations") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
