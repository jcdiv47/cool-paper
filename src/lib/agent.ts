import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { CACHE_BASE_DIR } from "./constants";
import { PROMPT_TEMPLATES } from "./quick-prompts";
import type { PaperMetadata } from "@/types";

export function buildPrompt(
  paper: PaperMetadata,
  promptInput: string,
  noteFilename: string,
  notesDir: string
): string {
  const template = PROMPT_TEMPLATES[promptInput] || promptInput;
  return `You are analyzing an academic paper.

Title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Abstract: ${paper.abstract}

${template}

Write your analysis as well-structured markdown. Save it to "${notesDir}/${noteFilename}".`;
}

export interface AgentQueryConfig {
  prompt: string;
  cwd: string;
  model?: string;
}

export function getAgentQueryConfig(
  paper: PaperMetadata,
  promptInput: string,
  noteFilename: string,
  model?: string
): AgentQueryConfig {
  const sanitizedId = paper.arxivId.replace(/\//g, "_");
  const cwd = CACHE_BASE_DIR;
  const notesDir = `${cwd}/papers/${sanitizedId}/notes`;
  const prompt = buildPrompt(paper, promptInput, noteFilename, notesDir);

  return { prompt, cwd, model };
}

export function startAgentQuery(
  config: AgentQueryConfig,
  abortController: AbortController
) {
  return query({
    prompt: config.prompt,
    options: {
      cwd: config.cwd,
      model: config.model ?? "haiku",
      tools: ["Read", "Write", "Glob"],
      allowedTools: ["Read", "Write", "Glob"],
      maxTurns: 20,
      abortController,
    },
  });
}

export function extractTextFromMessage(message: SDKMessage): string | null {
  if (message.type === "assistant" && message.message?.content) {
    const textBlocks = message.message.content.filter(
      (b: { type: string }) => b.type === "text"
    );
    if (textBlocks.length > 0) {
      return textBlocks
        .map((b: { type: string; text?: string }) => b.text ?? "")
        .join("");
    }
  }
  return null;
}
