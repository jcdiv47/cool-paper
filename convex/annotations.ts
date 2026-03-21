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

const annotationDocValidator = v.object({
  _id: v.id("annotations"),
  _creationTime: v.number(),
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
  createdAt: v.string(),
  updatedAt: v.string(),
});

const resolvedAnnotationValidator = v.object({
  _id: v.id("annotations"),
  _creationTime: v.number(),
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
  createdAt: v.string(),
  updatedAt: v.string(),
  annotationId: v.string(),
});

const resolvedAnnotationWithSanitizedIdValidator = v.object({
  _id: v.id("annotations"),
  _creationTime: v.number(),
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
  createdAt: v.string(),
  updatedAt: v.string(),
  annotationId: v.string(),
  sanitizedId: v.string(),
});

export const listByPaper = query({
  args: { paperId: v.id("papers") },
  returns: v.array(annotationDocValidator),
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
  returns: v.array(resolvedAnnotationValidator),
  handler: async (ctx, { paperIds, annotationIds }) => {
    if (paperIds.length > 50) throw new Error("Too many paperIds (max 50)");
    if (annotationIds.length > 200) throw new Error("Too many annotationIds (max 200)");

    const paperIdSet = new Set(paperIds.map(String));
    const matches = [];

    for (const idStr of annotationIds) {
      const id = ctx.db.normalizeId("annotations", idStr);
      if (!id) continue;
      const annotation = await ctx.db.get(id);
      if (!annotation) continue;
      if (!paperIdSet.has(String(annotation.paperId))) continue;
      matches.push({
        ...annotation,
        annotationId: String(annotation._id),
      });
    }

    return matches;
  },
});

export const resolveBySanitizedId = query({
  args: {
    sanitizedId: v.string(),
    annotationIds: v.array(v.string()),
  },
  returns: v.array(resolvedAnnotationWithSanitizedIdValidator),
  handler: async (ctx, { sanitizedId, annotationIds }) => {
    const paper = await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();

    if (!paper) return [];

    const results = [];
    for (const idStr of annotationIds) {
      const id = ctx.db.normalizeId("annotations", idStr);
      if (!id) continue;
      const annotation = await ctx.db.get(id);
      if (!annotation) continue;
      if (String(annotation.paperId) !== String(paper._id)) continue;
      results.push({
        ...annotation,
        annotationId: String(annotation._id),
        sanitizedId,
      });
    }

    return results;
  },
});

export const resolveAcrossSanitizedIds = query({
  args: {
    sanitizedIds: v.array(v.string()),
    annotationIds: v.array(v.string()),
  },
  returns: v.array(resolvedAnnotationWithSanitizedIdValidator),
  handler: async (ctx, { sanitizedIds, annotationIds }) => {
    if (sanitizedIds.length > 50) throw new Error("Too many sanitizedIds (max 50)");
    if (annotationIds.length > 200) throw new Error("Too many annotationIds (max 200)");

    // Build a map from paperId -> sanitizedId for all valid papers
    const paperIdToSanitizedId = new Map<string, string>();
    for (const sanitizedId of [...new Set(sanitizedIds)]) {
      const paper = await ctx.db
        .query("papers")
        .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
        .first();
      if (!paper) continue;
      paperIdToSanitizedId.set(String(paper._id), sanitizedId);
    }

    const results = [];
    for (const idStr of annotationIds) {
      const id = ctx.db.normalizeId("annotations", idStr);
      if (!id) continue;
      const annotation = await ctx.db.get(id);
      if (!annotation) continue;
      const sanitizedId = paperIdToSanitizedId.get(String(annotation.paperId));
      if (!sanitizedId) continue;
      results.push({
        ...annotation,
        annotationId: String(annotation._id),
        sanitizedId,
      });
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
  returns: v.id("annotations"),
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
  returns: v.id("annotations"),
  handler: async (ctx, { id, ...updates }) => {
    await ctx.db.patch(id, updates);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("annotations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    return null;
  },
});
