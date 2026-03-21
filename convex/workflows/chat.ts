import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "../workflow";

const CHAT_ACTION_RETRY = {
  maxAttempts: 3,
  initialBackoffMs: 5000,
  base: 2,
} as const;

const CHAT_GROUND_RETRY = {
  maxAttempts: 2,
  initialBackoffMs: 5000,
  base: 2,
} as const;

const CHAT_REPAIR_RETRY = {
  maxAttempts: 2,
  initialBackoffMs: 3000,
  base: 2,
} as const;

function formatWorkflowError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Chat workflow failed";
}

export const runChat = workflow.define({
  args: {
    threadId: v.id("threads"),
    message: v.string(),
    model: v.optional(v.string()),
    paperIds: v.array(v.string()),
    generation: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    try {
      // Step 1: Draft pass
      const draftResult = await step.runAction(
        internal.actions.chat.draftPass,
        {
          threadId: args.threadId,
          message: args.message,
          model: args.model,
          paperIds: args.paperIds,
          generation: args.generation,
        },
        { retry: CHAT_ACTION_RETRY, name: "draftPass" },
      );

      // Step 2: Ground & validate
      const groundResult = await step.runAction(
        internal.actions.chat.groundAndValidate,
        {
          threadId: args.threadId,
          draftJson: draftResult.draftJson,
          sourcePaths: draftResult.sourcePaths,
          model: args.model,
          paperIds: args.paperIds,
          generation: args.generation,
        },
        { retry: CHAT_GROUND_RETRY, name: "groundAndValidate" },
      );

      let assistantText = groundResult.assistantText;
      let citationEntries = groundResult.citationEntries;

      // Step 3: Repair (conditional)
      if (!groundResult.isValid) {
        const repairResult = await step.runAction(
          internal.actions.chat.repairPass,
          {
            threadId: args.threadId,
            draftJson: draftResult.draftJson,
            invalidText: groundResult.assistantText,
            issues: groundResult.issues,
            sourcePaths: draftResult.sourcePaths,
            model: args.model,
            paperIds: args.paperIds,
            generation: args.generation,
          },
          { retry: CHAT_REPAIR_RETRY, name: "repairPass" },
        );
        assistantText = repairResult.assistantText;
        citationEntries = repairResult.citationEntries;
      }

      // Step 4: Persist (checks generation — no-op if cancelled)
      await step.runMutation(
        internal.chat.persistChatResult,
        {
          threadId: args.threadId,
          assistantText,
          citationEntries,
          model: args.model,
          generation: args.generation,
        },
        { name: "persistChatResult" },
      );
    } catch (error) {
      await step.runMutation(
        internal.chat.markChatFailed,
        {
          threadId: args.threadId,
          error: formatWorkflowError(error),
          generation: args.generation,
        },
        { name: "markChatFailed" },
      );
      throw error;
    }
  },
});
