import type { TaskType, TaskConfig } from "./types";

function citationRules() {
  return `Citation rules:
- Use only refIds that appear in the provided evidence index JSONL files.
- Every non-trivial factual claim about a paper must include at least one inline citation token.
- Citation token format must be exactly [[cite:<refId>]].
- Do not invent page numbers, bibliography-style citations, or freeform citation text.
- If the evidence index does not support a claim, say that directly and do not cite it.`;
}

function annotationRules() {
  return `Annotation rules:
- Saved user highlights and notes may be referenced with [[annot:<annotationId>]].
- Use only annotation ids that appear in the provided saved-annotation lists.
- Annotation tokens are optional and only for referring to saved user annotations.
- Do not use annotation tokens as substitutes for evidence citations.`;
}

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
Evidence index: ${ctx.paperEvidencePath}
${ctx.paperAnnotationsBlock ? `\n${ctx.paperAnnotationsBlock}` : ""}

${ctx.taskInstruction}

${citationRules()}
${annotationRules()}

Write your analysis as well-structured markdown.
Use the evidence index as the canonical source for citations.
Save the note to "${ctx.notesDir}/${ctx.noteFilename}".`,
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

    // Multi-paper context
    if (ctx.papers && ctx.papers.length > 0) {
      const papersBlock = ctx.papers
        .map((p, i) => {
          const sanitizedId = p.arxivId.replace(/\//g, "_");
          return `[${i + 1}] "${p.title}" — ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}
    Abstract: ${p.abstract.slice(0, 300)}${p.abstract.length > 300 ? "…" : ""}
    Source files: papers/${sanitizedId}/
    Evidence index: ${ctx.paperEvidencePaths?.[i] ?? `papers/${sanitizedId}/evidence-index.jsonl`}
    ${ctx.paperAnnotationsBlocks?.[i] ?? "Saved annotations: none."}`;
        })
        .join("\n\n");

      return `You are discussing academic papers with the user.

Papers in this conversation:
${papersBlock}

The paper source files are available in the current working directory under papers/.
When referencing papers, use their number [1], [2], etc. or title.
${citationRules()}
${annotationRules()}
${historyBlock}
${ctx.taskInstruction}`;
    }

    return `You are discussing an academic paper with the user.

Title: ${ctx.paper.title}
Authors: ${ctx.paper.authors.join(", ")}
Abstract: ${ctx.paper.abstract}
Evidence index: ${ctx.paperEvidencePath}
${ctx.paperAnnotationsBlock ? `\n${ctx.paperAnnotationsBlock}` : ""}

The paper source files are available in the current working directory.
${citationRules()}
${annotationRules()}
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
