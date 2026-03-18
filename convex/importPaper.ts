import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const markImportCompleted = internalMutation({
  args: {
    paperId: v.id("papers"),
  },
  handler: async (ctx, { paperId }) => {
    await ctx.db.patch(paperId, {
      importStatus: "completed",
    });
  },
});

export const markImportFailed = internalMutation({
  args: {
    paperId: v.id("papers"),
    error: v.string(),
  },
  handler: async (ctx, { paperId, error }) => {
    await ctx.db.patch(paperId, {
      importStatus: `failed: ${error.slice(0, 280)}`,
    });
  },
});
