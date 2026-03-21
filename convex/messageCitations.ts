import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const citationEntry = v.object({
  paperId: v.id("papers"),
  indexVersion: v.number(),
  refId: v.string(),
  occurrence: v.number(),
});

const messageCitationDocValidator = v.object({
  _id: v.id("message_citations"),
  _creationTime: v.number(),
  messageId: v.id("messages"),
  paperId: v.id("papers"),
  indexVersion: v.number(),
  refId: v.string(),
  occurrence: v.number(),
  createdAt: v.string(),
});

export const listByMessage = query({
  args: { messageId: v.id("messages") },
  returns: v.array(messageCitationDocValidator),
  handler: async (ctx, { messageId }) => {
    const citations = await ctx.db
      .query("message_citations")
      .withIndex("by_messageId_occurrence", (q) =>
        q.eq("messageId", messageId)
      )
      .collect();

    citations.sort((a, b) => a.occurrence - b.occurrence);
    return citations;
  },
});

export const replaceForMessage = mutation({
  args: {
    messageId: v.id("messages"),
    entries: v.array(citationEntry),
  },
  returns: v.number(),
  handler: async (ctx, { messageId, entries }) => {
    const existing = await ctx.db
      .query("message_citations")
      .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
      .collect();

    for (const citation of existing) {
      await ctx.db.delete(citation._id);
    }

    const now = new Date().toISOString();
    for (const entry of entries) {
      await ctx.db.insert("message_citations", {
        messageId,
        ...entry,
        createdAt: now,
      });
    }

    return entries.length;
  },
});
