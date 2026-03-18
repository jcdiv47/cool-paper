"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const deletePaper = action({
  args: {
    paperId: v.id("papers"),
  },
  handler: async (ctx, { paperId }) => {
    const paper = await ctx.runQuery(api.papers.getById, { id: paperId });
    if (!paper) return;

    // Delete source files
    await ctx.runMutation(api.paperSourceFiles.replaceForPaper, {
      paperId,
      files: [],
    });

    // Delete PDF from storage
    if (paper.pdfStorageId) {
      await ctx.storage.delete(paper.pdfStorageId);
    }

    // Delete paper and cascade (notes, annotations, chunks, citations, jobs)
    await ctx.runMutation(api.papers.remove, { id: paperId });
  },
});
