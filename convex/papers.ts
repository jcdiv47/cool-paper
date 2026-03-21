import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const paperDocValidator = v.object({
  _id: v.id("papers"),
  _creationTime: v.number(),
  arxivId: v.string(),
  sanitizedId: v.string(),
  title: v.string(),
  authors: v.array(v.string()),
  abstract: v.string(),
  summary: v.optional(v.string()),
  published: v.string(),
  categories: v.array(v.string()),
  addedAt: v.string(),
  activeIndexVersion: v.optional(v.number()),
  pdfStorageId: v.optional(v.id("_storage")),
  importStatus: v.optional(v.string()),
});

async function removePaperArtifacts(
  ctx: MutationCtx,
  paperId: Id<"papers">,
  sanitizedId: string,
  excludeJobId?: Id<"jobs">
) {
  const annotations = await ctx.db
    .query("annotations")
    .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
    .collect();
  for (const annotation of annotations) {
    await ctx.db.delete(annotation._id);
  }

  const messageCitations = await ctx.db
    .query("message_citations")
    .withIndex("by_paperId_refId", (q) => q.eq("paperId", paperId))
    .collect();
  for (const citation of messageCitations) {
    await ctx.db.delete(citation._id);
  }

  const chunks = await ctx.db
    .query("paper_chunks")
    .withIndex("by_paperId_indexVersion", (q) => q.eq("paperId", paperId))
    .collect();
  for (const chunk of chunks) {
    await ctx.db.delete(chunk._id);
  }

  const indexes = await ctx.db
    .query("paper_indexes")
    .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
    .collect();
  for (const index of indexes) {
    await ctx.db.delete(index._id);
  }

  // Delete paper source files
  const sourceFiles = await ctx.db
    .query("paper_source_files")
    .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
    .collect();
  for (const file of sourceFiles) {
    await ctx.db.delete(file._id);
  }

  // Delete PDF from storage
  const paper = await ctx.db.get(paperId);
  if (paper?.pdfStorageId) {
    await ctx.storage.delete(paper.pdfStorageId);
  }

  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_sanitizedPaperId", (q) =>
      q.eq("sanitizedPaperId", sanitizedId)
    )
    .collect();
  for (const job of jobs) {
    if (excludeJobId && job._id === excludeJobId) continue;
    if (job.status === "running") continue;
    const events = await ctx.db
      .query("job_events")
      .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
      .collect();
    for (const event of events) {
      await ctx.db.delete(event._id);
    }
    await ctx.db.delete(job._id);
  }
}

export const list = query({
  args: {},
  returns: v.array(paperDocValidator),
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
  returns: v.union(paperDocValidator, v.null()),
  handler: async (ctx, { sanitizedId }) => {
    return await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();
  },
});

export const getPdfUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

export const getById = query({
  args: { id: v.id("papers") },
  returns: v.union(paperDocValidator, v.null()),
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
    summary: v.optional(v.string()),
    published: v.string(),
    categories: v.array(v.string()),
    addedAt: v.string(),
  },
  returns: v.id("papers"),
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
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const paper = await ctx.db.get(id);
    if (!paper) return null;

    await removePaperArtifacts(ctx, id, paper.sanitizedId);

    await ctx.db.delete(id);
    return null;
  },
});

export const updateImportStatus = internalMutation({
  args: {
    id: v.id("papers"),
    importStatus: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, importStatus }) => {
    await ctx.db.patch(id, { importStatus });
    return null;
  },
});

export const updateSummary = internalMutation({
  args: {
    id: v.id("papers"),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, summary }) => {
    await ctx.db.patch(id, { summary });
    return null;
  },
});

export const updatePdfStorage = internalMutation({
  args: {
    id: v.id("papers"),
    pdfStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, { id, pdfStorageId }) => {
    await ctx.db.patch(id, { pdfStorageId });
    return null;
  },
});

export const removeBySanitizedId = mutation({
  args: {
    sanitizedId: v.string(),
    excludeJobId: v.optional(v.id("jobs")),
  },
  returns: v.null(),
  handler: async (ctx, { sanitizedId, excludeJobId }) => {
    const paper = await ctx.db
      .query("papers")
      .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", sanitizedId))
      .first();
    if (!paper) return null;

    await removePaperArtifacts(ctx, paper._id, sanitizedId, excludeJobId);

    await ctx.db.delete(paper._id);
    return null;
  },
});
