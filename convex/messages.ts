import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const messageDocValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  threadId: v.id("threads"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  thinking: v.optional(v.string()),
  model: v.optional(v.string()),
  timestamp: v.string(),
  isPartial: v.optional(v.boolean()),
});

async function updateThreadMessageMetadata(
  ctx: MutationCtx,
  threadId: Id<"threads">,
  timestamp: string,
  content: string,
) {
  const thread = await ctx.db.get(threadId);
  await ctx.db.patch(threadId, {
    updatedAt: timestamp,
    messageCount: (thread?.messageCount ?? 0) + 1,
    preview: content.slice(0, 100),
  });
}

export const listByThread = query({
  args: { threadId: v.id("threads") },
  returns: v.array(messageDocValidator),
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
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    if (args.content.length > 100_000) {
      throw new Error("Message content exceeds maximum length (100,000 characters)");
    }
    const id = await ctx.db.insert("messages", args);
    await updateThreadMessageMetadata(ctx, args.threadId, args.timestamp, args.content);
    return id;
  },
});

export const addUserMessage = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    timestamp: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, { threadId, content, timestamp }) => {
    if (content.length > 100_000) {
      throw new Error("Message content exceeds maximum length (100,000 characters)");
    }
    const id = await ctx.db.insert("messages", {
      threadId,
      role: "user",
      content,
      timestamp,
    });
    await updateThreadMessageMetadata(ctx, threadId, timestamp, content);
    return id;
  },
});
