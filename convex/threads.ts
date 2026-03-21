import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const threadDocValidator = v.object({
  _id: v.id("threads"),
  _creationTime: v.number(),
  title: v.string(),
  paperIds: v.array(v.string()),
  solePaperId: v.optional(v.string()),
  model: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  agentThreadId: v.optional(v.string()),
  chatStatus: v.optional(v.union(v.literal("generating"), v.literal("error"))),
  chatError: v.optional(v.string()),
  chatGeneration: v.optional(v.number()),
  messageCount: v.optional(v.number()),
  preview: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const threadListItemValidator = v.object({
  _id: v.id("threads"),
  id: v.id("threads"),
  title: v.string(),
  updatedAt: v.string(),
  messageCount: v.number(),
  preview: v.optional(v.string()),
  paperIds: v.array(v.string()),
  paperTitles: v.array(v.string()),
});

function getSolePaperId(paperIds: string[]) {
  return paperIds.length === 1 ? paperIds[0] : undefined;
}

export const list = query({
  args: {},
  returns: v.array(threadListItemValidator),
  handler: async (ctx) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_updatedAt")
      .order("desc")
      .collect();

    // Collect all unique paper sanitizedIds across all threads (deduplicated)
    const allPaperIds = new Set<string>();
    for (const t of threads) {
      if (!t.messageCount) continue;
      for (const pid of t.paperIds) allPaperIds.add(pid);
    }

    // Batch lookup: one query per unique paper, not per thread
    const paperTitleMap = new Map<string, string>();
    for (const pid of allPaperIds) {
      const paper = await ctx.db
        .query("papers")
        .withIndex("by_sanitizedId", (q) => q.eq("sanitizedId", pid))
        .first();
      paperTitleMap.set(pid, paper?.title ?? pid);
    }

    // Build results using the map
    const results = [];
    for (const thread of threads) {
      if (!thread.messageCount) continue;

      results.push({
        _id: thread._id,
        id: thread._id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        messageCount: thread.messageCount,
        preview: thread.preview,
        paperIds: thread.paperIds,
        paperTitles: thread.paperIds.map((pid) => paperTitleMap.get(pid) ?? pid),
      });
    }

    return results;
  },
});

export const get = query({
  args: { id: v.id("threads") },
  returns: v.union(threadDocValidator, v.null()),
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByPaperId = query({
  args: { paperId: v.string() },
  returns: v.union(threadDocValidator, v.null()),
  handler: async (ctx, { paperId }) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_solePaperId_updatedAt", (q) => q.eq("solePaperId", paperId))
      .order("desc")
      .first();
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
  returns: v.id("threads"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("threads", {
      ...args,
      solePaperId: getSolePaperId(args.paperIds),
      messageCount: 0,
      preview: undefined,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("threads") },
  returns: v.null(),
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
    return null;
  },
});

export const updateSession = mutation({
  args: {
    id: v.id("threads"),
    sessionId: v.optional(v.string()),
    model: v.optional(v.string()),
    updatedAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, sessionId, model, updatedAt }) => {
    const patch: {
      updatedAt: string;
      sessionId?: string;
      model?: string;
    } = { updatedAt };
    if (sessionId !== undefined) patch.sessionId = sessionId;
    if (model !== undefined) patch.model = model;
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const updateTitle = mutation({
  args: { id: v.id("threads"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, title }) => {
    await ctx.db.patch(id, { title });
    return null;
  },
});

export const updateAgentThread = internalMutation({
  args: {
    id: v.id("threads"),
    agentThreadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, agentThreadId }) => {
    await ctx.db.patch(id, { agentThreadId });
    return null;
  },
});

export const setChatGenerating = internalMutation({
  args: { id: v.id("threads") },
  returns: v.number(),
  handler: async (ctx, { id }) => {
    const thread = await ctx.db.get(id);
    const generation = (thread?.chatGeneration ?? 0) + 1;
    await ctx.db.patch(id, {
      chatStatus: "generating",
      chatError: undefined,
      chatGeneration: generation,
    });
    return generation;
  },
});

export const clearChatStatus = internalMutation({
  args: { id: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, {
      chatStatus: undefined,
      chatError: undefined,
    });
    return null;
  },
});

export const cancelChat = mutation({
  args: { id: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const thread = await ctx.db.get(id);
    if (thread?.chatStatus === "generating") {
      await ctx.db.patch(id, {
        chatStatus: undefined,
        chatError: undefined,
        chatGeneration: (thread.chatGeneration ?? 0) + 1,
      });
    }
    return null;
  },
});

export const updatePapers = mutation({
  args: { id: v.id("threads"), paperIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, paperIds }) => {
    await ctx.db.patch(id, {
      paperIds,
      solePaperId: getSolePaperId(paperIds),
      updatedAt: new Date().toISOString(),
      // Clear session and streaming thread since paper context changed.
      sessionId: undefined,
      agentThreadId: undefined,
    });
    return null;
  },
});
