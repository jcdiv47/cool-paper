import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_threadId_timestamp", (q) => q.eq("threadId", threadId))
      .collect();
  },
});

export const addMessage = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    thinking: v.optional(v.string()),
    model: v.optional(v.string()),
    timestamp: v.string(),
    isPartial: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", args);
    // Update thread updatedAt
    await ctx.db.patch(args.threadId, { updatedAt: args.timestamp });
    return id;
  },
});

export const addUserMessage = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    timestamp: v.string(),
  },
  handler: async (ctx, { threadId, content, timestamp }) => {
    const id = await ctx.db.insert("messages", {
      threadId,
      role: "user",
      content,
      timestamp,
    });
    await ctx.db.patch(threadId, { updatedAt: timestamp });
    return id;
  },
});

export const upsertPartial = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    thinking: v.optional(v.string()),
    model: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, { threadId, content, thinking, model, timestamp }) => {
    // Find existing partial message for this thread
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .collect();
    const partial = messages.find(
      (m) => m.role === "assistant" && m.isPartial === true
    );

    if (partial) {
      await ctx.db.patch(partial._id, {
        content,
        ...(thinking !== undefined ? { thinking } : {}),
        ...(model ? { model } : {}),
      });
      return partial._id;
    }

    return await ctx.db.insert("messages", {
      threadId,
      role: "assistant",
      content,
      thinking,
      model,
      timestamp,
      isPartial: true,
    });
  },
});

export const deletePartial = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .collect();
    const partial = messages.find(
      (m) => m.role === "assistant" && m.isPartial === true
    );
    if (partial) {
      await ctx.db.delete(partial._id);
    }
  },
});

export const finalizePartial = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    thinking: v.optional(v.string()),
    model: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, { threadId, content, thinking, model, timestamp }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .collect();
    const partial = messages.find(
      (m) => m.role === "assistant" && m.isPartial === true
    );

    if (partial) {
      await ctx.db.patch(partial._id, {
        content,
        ...(thinking !== undefined ? { thinking } : {}),
        ...(model ? { model } : {}),
        timestamp,
        isPartial: false,
      });
      return partial._id;
    }

    // No partial found, create a complete message
    return await ctx.db.insert("messages", {
      threadId,
      role: "assistant",
      content,
      thinking,
      model,
      timestamp,
    });
  },
});
