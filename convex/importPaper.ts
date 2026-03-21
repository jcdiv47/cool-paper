import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const markImportCompleted = internalMutation({
  args: {
    paperId: v.id("papers"),
  },
  returns: v.null(),
  handler: async (ctx, { paperId }) => {
    await ctx.db.patch(paperId, {
      importStatus: "completed",
    });
    return null;
  },
});

export const markImportFailed = internalMutation({
  args: {
    paperId: v.id("papers"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { paperId, error }) => {
    await ctx.db.patch(paperId, {
      importStatus: `failed: ${error.slice(0, 280)}`,
    });
    return null;
  },
});
