import { CACHE_BASE_DIR } from "../constants";
import { PROMPT_TEMPLATES } from "../quick-prompts";
import { getTaskConfig } from "./task-configs";
import type { PaperMetadata, ThreadMessage } from "@/types";
import type { TaskType, AgentOptions, PromptContext, ResolvedAgentQuery } from "./types";

export interface ResolveAgentQueryParams {
  paper: PaperMetadata;
  promptInput: string;
  noteFilename: string;
  taskType?: TaskType;
  optionOverrides?: Partial<AgentOptions>;
  conversationHistory?: ThreadMessage[];
}

export function resolveAgentQuery(params: ResolveAgentQueryParams): ResolvedAgentQuery {
  const {
    paper,
    promptInput,
    noteFilename,
    taskType = "note-generation",
    optionOverrides,
    conversationHistory,
  } = params;

  const config = getTaskConfig(taskType);
  const sanitizedId = paper.arxivId.replace(/\//g, "_");
  const cwd = CACHE_BASE_DIR;
  const notesDir = `${cwd}/papers/${sanitizedId}/notes`;
  const taskInstruction = PROMPT_TEMPLATES[promptInput] || promptInput;

  const context: PromptContext = {
    paper, promptInput, taskInstruction, notesDir, noteFilename,
    conversationHistory,
  };

  const mergedOptions: AgentOptions = { ...config.agentOptions, ...optionOverrides };
  const prompt = config.buildPrompt(context);
  const displayCommand = `claude -p '...' --model ${mergedOptions.model} --allowedTools "${mergedOptions.allowedTools.join(",")}" [${config.displayLabel}]`;

  return { prompt, cwd, options: mergedOptions, displayCommand };
}
