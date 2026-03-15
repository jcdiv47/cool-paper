import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByPaper = query({
  args: { sanitizedPaperId: v.string() },
  handler: async (ctx, { sanitizedPaperId }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .collect();
    // Sort by modifiedAt desc
    notes.sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );
    return notes;
  },
});

export const get = query({
  args: { sanitizedPaperId: v.string(), filename: v.string() },
  handler: async (ctx, { sanitizedPaperId, filename }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .collect();
    return notes.find((n) => n.filename === filename) ?? null;
  },
});

export const recentNotes = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const max = limit ?? 6;
    const allNotes = await ctx.db
      .query("notes")
      .withIndex("by_modifiedAt")
      .order("desc")
      .take(max * 3); // Over-fetch to account for possible orphans

    const results = [];
    for (const note of allNotes) {
      if (results.length >= max) break;
      const paper = await ctx.db.get(note.paperId);
      if (!paper) continue;
      results.push({
        ...note,
        paperTitle: paper.title,
      });
    }
    return results;
  },
});

export const allDates = query({
  args: {},
  handler: async (ctx) => {
    const notes = await ctx.db.query("notes").collect();
    return notes.map((n) => n.modifiedAt);
  },
});

export const countByPapers = query({
  args: {},
  handler: async (ctx) => {
    const papers = await ctx.db.query("papers").collect();
    const counts: Record<string, number> = {};
    for (const paper of papers) {
      const notes = await ctx.db
        .query("notes")
        .withIndex("by_paperId", (q) => q.eq("paperId", paper._id))
        .collect();
      counts[paper.arxivId] = notes.length;
    }
    return counts;
  },
});

export const search = query({
  args: { sanitizedPaperId: v.string(), query: v.string() },
  handler: async (ctx, { sanitizedPaperId, query: q }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_sanitizedPaperId", (q2) =>
        q2.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .collect();

    if (!q.trim()) return notes;

    const lower = q.toLowerCase();
    return notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(lower) ||
          n.content.toLowerCase().includes(lower)
      )
      .map((n) => {
        if (n.title.toLowerCase().includes(lower)) return n;
        const idx = n.content.toLowerCase().indexOf(lower);
        const start = Math.max(0, idx - 40);
        const end = Math.min(n.content.length, idx + q.length + 40);
        const snippet =
          (start > 0 ? "..." : "") +
          n.content.slice(start, end).replace(/\n/g, " ") +
          (end < n.content.length ? "..." : "");
        return { ...n, snippet };
      });
  },
});

export const upsert = mutation({
  args: {
    paperId: v.id("papers"),
    sanitizedPaperId: v.string(),
    filename: v.string(),
    title: v.string(),
    content: v.string(),
    model: v.optional(v.string()),
    createdAt: v.string(),
    modifiedAt: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if note already exists
    const existing = await ctx.db
      .query("notes")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", args.sanitizedPaperId)
      )
      .collect();
    const match = existing.find((n) => n.filename === args.filename);

    if (match) {
      await ctx.db.patch(match._id, {
        title: args.title,
        content: args.content,
        model: args.model,
        modifiedAt: args.modifiedAt,
      });
      return match._id;
    }

    return await ctx.db.insert("notes", args);
  },
});

export const remove = mutation({
  args: { sanitizedPaperId: v.string(), filename: v.string() },
  handler: async (ctx, { sanitizedPaperId, filename }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_sanitizedPaperId", (q) =>
        q.eq("sanitizedPaperId", sanitizedPaperId)
      )
      .collect();
    const match = notes.find((n) => n.filename === filename);
    if (match) {
      await ctx.db.delete(match._id);
    }
  },
});
