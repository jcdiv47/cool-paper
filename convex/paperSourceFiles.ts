import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const sourceFileDocValidator = v.object({
  _id: v.id("paper_source_files"),
  _creationTime: v.number(),
  paperId: v.id("papers"),
  relativePath: v.string(),
  content: v.string(),
  fileType: v.string(),
});

export const getByPath = query({
  args: {
    paperId: v.id("papers"),
    relativePath: v.string(),
  },
  returns: v.union(sourceFileDocValidator, v.null()),
  handler: async (ctx, { paperId, relativePath }) => {
    return await ctx.db
      .query("paper_source_files")
      .withIndex("by_paperId_path", (q) =>
        q.eq("paperId", paperId).eq("relativePath", relativePath)
      )
      .first();
  },
});

export const listByPaper = query({
  args: { paperId: v.id("papers") },
  returns: v.array(sourceFileDocValidator),
  handler: async (ctx, { paperId }) => {
    return await ctx.db
      .query("paper_source_files")
      .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
      .collect();
  },
});

export const insert = mutation({
  args: {
    paperId: v.id("papers"),
    relativePath: v.string(),
    content: v.string(),
    fileType: v.string(),
  },
  returns: v.id("paper_source_files"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("paper_source_files", args);
  },
});

export const replaceForPaper = mutation({
  args: {
    paperId: v.id("papers"),
    files: v.array(
      v.object({
        relativePath: v.string(),
        content: v.string(),
        fileType: v.string(),
      })
    ),
  },
  returns: v.number(),
  handler: async (ctx, { paperId, files }) => {
    await deleteForPaper(ctx, paperId);
    for (const file of files) {
      await ctx.db.insert("paper_source_files", { paperId, ...file });
    }
    return files.length;
  },
});

export async function deleteForPaper(
  ctx: MutationCtx,
  paperId: Id<"papers">
) {
  const existing = await ctx.db
    .query("paper_source_files")
    .withIndex("by_paperId", (q) => q.eq("paperId", paperId))
    .collect();
  for (const file of existing) {
    await ctx.db.delete(file._id);
  }
}
