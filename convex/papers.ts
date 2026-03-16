import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function removePaperArtifacts(
  ctx: MutationCtx,
  paperId: Id<"papers">,
  sanitizedId: string
) {
  const notes = await ctx.db
    .query("notes")
    .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
    .collect();
  for (const note of notes) {
    const citations = await ctx.db
      .query("note_citations")
      .withIndex("by_noteId", (q) => q.eq("noteId", note._id))
      .collect();
    for (const citation of citations) {
      await ctx.db.delete(citation._id);
    }
    await ctx.db.delete(note._id);
  }

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
}

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

    await removePaperArtifacts(ctx, id, paper.sanitizedId);

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

    await removePaperArtifacts(ctx, paper._id, sanitizedId);

    await ctx.db.delete(paper._id);
  },
});
