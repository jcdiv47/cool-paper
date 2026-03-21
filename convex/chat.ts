import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const citationEntryValidator = v.object({
  paperId: v.id("papers"),
  indexVersion: v.number(),
  refId: v.string(),
  occurrence: v.number(),
});

export const persistChatResult = internalMutation({
  args: {
    threadId: v.id("threads"),
    assistantText: v.string(),
    citationEntries: v.array(citationEntryValidator),
    model: v.optional(v.string()),
    generation: v.number(),
  },
  handler: async (ctx, { threadId, assistantText, citationEntries, model, generation }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.chatGeneration !== generation) return null;

    const now = new Date().toISOString();

    const messageId = await ctx.db.insert("messages", {
      threadId,
      role: "assistant",
      content: assistantText,
      model,
      timestamp: now,
    });

    for (const entry of citationEntries) {
      await ctx.db.insert("message_citations", {
        messageId,
        ...entry,
        createdAt: now,
      });
    }

    await ctx.db.patch(threadId, {
      model,
      updatedAt: now,
      chatStatus: undefined,
      chatError: undefined,
    });

    return messageId;
  },
});

export const markChatFailed = internalMutation({
  args: {
    threadId: v.id("threads"),
    error: v.string(),
    generation: v.number(),
  },
  handler: async (ctx, { threadId, error, generation }) => {
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.chatGeneration !== generation) return;

    await ctx.db.patch(threadId, {
      chatStatus: "error",
      chatError: error.slice(0, 500),
    });
  },
});
