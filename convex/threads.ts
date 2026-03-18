import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_updatedAt")
      .order("desc")
      .collect();

    const results = [];
    for (const thread of threads) {
      // Count messages
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_threadId", (q) => q.eq("threadId", thread._id))
        .collect();

      // Skip empty threads
      if (messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];

      // Resolve paper titles
      const paperTitles: string[] = [];
      for (const pid of thread.paperIds) {
        const paper = await ctx.db
          .query("papers")
          .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", pid))
          .first();
        paperTitles.push(paper?.title ?? pid);
      }

      results.push({
        _id: thread._id,
        id: thread._id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        messageCount: messages.length,
        preview: lastMsg?.content.slice(0, 100),
        paperIds: thread.paperIds,
        paperTitles,
      });
    }

    return results;
  },
});

export const get = query({
  args: { id: v.id("threads") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByPaperId = query({
  args: { paperId: v.string() },
  handler: async (ctx, { paperId }) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_updatedAt")
      .order("desc")
      .collect();
    return (
      threads.find(
        (t) => t.paperIds.length === 1 && t.paperIds[0] === paperId
      ) ?? null
    );
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    paperIds: v.array(v.string()),
    model: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("threads", args);
  },
});

export const remove = mutation({
  args: { id: v.id("threads") },
  handler: async (ctx, { id }) => {
    // Cascade delete messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", id))
      .collect();
    for (const msg of messages) {
      const citations = await ctx.db
        .query("message_citations")
        .withIndex("by_messageId", (q) => q.eq("messageId", msg._id))
        .collect();
      for (const citation of citations) {
        await ctx.db.delete(citation._id);
      }
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(id);
  },
});

export const updateSession = mutation({
  args: {
    id: v.id("threads"),
    sessionId: v.optional(v.string()),
    model: v.optional(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, { id, sessionId, model, updatedAt }) => {
    const patch: Record<string, unknown> = { updatedAt };
    if (sessionId !== undefined) patch.sessionId = sessionId;
    if (model !== undefined) patch.model = model;
    await ctx.db.patch(id, patch);
  },
});

export const updateTitle = mutation({
  args: { id: v.id("threads"), title: v.string() },
  handler: async (ctx, { id, title }) => {
    await ctx.db.patch(id, { title });
  },
});

export const updateAgentThread = mutation({
  args: {
    id: v.id("threads"),
    agentThreadId: v.string(),
  },
  handler: async (ctx, { id, agentThreadId }) => {
    await ctx.db.patch(id, { agentThreadId });
  },
});

export const updatePapers = mutation({
  args: { id: v.id("threads"), paperIds: v.array(v.string()) },
  handler: async (ctx, { id, paperIds }) => {
    await ctx.db.patch(id, {
      paperIds,
      updatedAt: new Date().toISOString(),
      // Clear session since paper context changed
      sessionId: undefined,
    });
  },
});
