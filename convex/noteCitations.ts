import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const citationEntry = v.object({
  paperId: v.id("papers"),
  indexVersion: v.number(),
  refId: v.string(),
  occurrence: v.number(),
});

export const listByNote = query({
  args: { noteId: v.id("notes") },
  handler: async (ctx, { noteId }) => {
    const citations = await ctx.db
      .query("note_citations")
      .withIndex("by_noteId_occurrence", (q) => q.eq("noteId", noteId))
      .collect();

    citations.sort((a, b) => a.occurrence - b.occurrence);
    return citations;
  },
});

export const replaceForNote = mutation({
  args: {
    noteId: v.id("notes"),
    entries: v.array(citationEntry),
  },
  handler: async (ctx, { noteId, entries }) => {
    const existing = await ctx.db
      .query("note_citations")
      .withIndex("by_noteId", (q) => q.eq("noteId", noteId))
      .collect();

    for (const citation of existing) {
      await ctx.db.delete(citation._id);
    }

    const now = new Date().toISOString();
    for (const entry of entries) {
      await ctx.db.insert("note_citations", {
        noteId,
        ...entry,
        createdAt: now,
      });
    }

    return entries.length;
  },
});
