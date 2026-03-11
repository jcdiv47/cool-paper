import type { TaskType, TaskConfig } from "./types";

export const NOTE_GENERATION_CONFIG: TaskConfig = {
  taskType: "note-generation",
  agentOptions: {
    model: "haiku",
    tools: ["Read", "Write", "Glob"],
    allowedTools: ["Read", "Write", "Glob"],
    maxTurns: 20,
  },
  buildPrompt: (ctx) =>
    `You are analyzing an academic paper.

Title: ${ctx.paper.title}
Authors: ${ctx.paper.authors.join(", ")}
Abstract: ${ctx.paper.abstract}

${ctx.taskInstruction}

Write your analysis as well-structured markdown. Save it to "${ctx.notesDir}/${ctx.noteFilename}".`,
  displayLabel: "Generate Note",
};

export const CONVERSATION_CONFIG: TaskConfig = {
  taskType: "conversation",
  agentOptions: {
    model: "haiku",
    tools: ["Read", "Glob"],
    allowedTools: ["Read", "Glob"],
    maxTurns: 50,
    persistSession: true,
    includePartialMessages: true,
    thinking: { type: "adaptive" },
  },
  buildPrompt: (ctx) => {
    let historyBlock = "";
    if (ctx.conversationHistory && ctx.conversationHistory.length > 0) {
      const formatted = ctx.conversationHistory
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      historyBlock = `\nPrevious conversation:\n${formatted}\n\nNow respond to the user's latest message.\n`;
    }

    return `You are discussing an academic paper with the user.

Title: ${ctx.paper.title}
Authors: ${ctx.paper.authors.join(", ")}
Abstract: ${ctx.paper.abstract}

The paper source files are available in the current working directory.
${historyBlock}
${ctx.taskInstruction}`;
  },
  displayLabel: "Conversation",
};

/** Typed record — adding a TaskType variant without a config entry is a compile error */
export const TASK_CONFIGS: Record<TaskType, TaskConfig> = {
  "note-generation": NOTE_GENERATION_CONFIG,
  "conversation": CONVERSATION_CONFIG,
};

export function getTaskConfig(taskType: TaskType): TaskConfig {
  return TASK_CONFIGS[taskType];
}
