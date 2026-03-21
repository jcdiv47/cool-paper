import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "../workflow";

const IMPORT_ACTION_RETRY = {
  maxAttempts: 10_000,
  initialBackoffMs: 60_000,
  base: 1.2,
} as const;

function formatWorkflowError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Import workflow failed";
}

export const runImportPaper = workflow.define({
  args: {
    paperId: v.id("papers"),
    arxivId: v.string(),
    sanitizedId: v.string(),
  },
  handler: async (step, args): Promise<void> => {
    try {
      await step.runAction(internal.actions.importPaper.ingestPaperAssets, args, {
        retry: IMPORT_ACTION_RETRY,
        name: "ingestPaperAssets",
      });
      await step.runAction(
        internal.actions.importPaper.generatePaperSummary,
        { paperId: args.paperId },
        {
          retry: IMPORT_ACTION_RETRY,
          name: "generatePaperSummary",
        },
      );
      await step.runMutation(
        internal.importPaper.markImportCompleted,
        { paperId: args.paperId },
        { name: "markImportCompleted" },
      );
    } catch (error) {
      await step.runMutation(
        internal.importPaper.markImportFailed,
        {
          paperId: args.paperId,
          error: formatWorkflowError(error),
        },
        { name: "markImportFailed" },
      );
      throw error;
    }
  },
});

export const runRegenerateSummary = workflow.define({
  args: {
    paperId: v.id("papers"),
  },
  handler: async (step, args): Promise<void> => {
    try {
      await step.runAction(
        internal.actions.importPaper.generatePaperSummary,
        { paperId: args.paperId },
        {
          retry: IMPORT_ACTION_RETRY,
          name: "generatePaperSummary",
        },
      );
      await step.runMutation(
        internal.importPaper.markImportCompleted,
        { paperId: args.paperId },
        { name: "markImportCompleted" },
      );
    } catch (error) {
      await step.runMutation(
        internal.importPaper.markImportFailed,
        {
          paperId: args.paperId,
          error: formatWorkflowError(error),
        },
        { name: "markImportFailed" },
      );
      throw error;
    }
  },
});
