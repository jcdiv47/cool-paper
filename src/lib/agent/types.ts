import type { Options as SDKOptions } from "@anthropic-ai/claude-agent-sdk";
import type { PaperMetadata, ThreadMessage } from "@/types";

/** Discriminated union — extend when adding new task types */
export type TaskType = "note-generation" | "conversation";

/**
 * Curated subset of SDK Options we expose to task configs.
 * Each field maps 1:1 to a field on the SDK's Options type.
 */
export interface AgentOptions {
  model: string;
  tools: NonNullable<SDKOptions["tools"]>;
  allowedTools: NonNullable<SDKOptions["allowedTools"]>;
  maxTurns: NonNullable<SDKOptions["maxTurns"]>;
  systemPrompt?: SDKOptions["systemPrompt"];
  resume?: SDKOptions["resume"];
  sessionId?: SDKOptions["sessionId"];
  continue?: SDKOptions["continue"];
  persistSession?: SDKOptions["persistSession"];
  includePartialMessages?: SDKOptions["includePartialMessages"];
  thinking?: SDKOptions["thinking"];
}

/** Context passed to task config's buildPrompt function */
export interface PromptContext {
  paper: PaperMetadata;
  /** Multiple papers for cross-paper chat */
  papers?: PaperMetadata[];
  paperEvidencePath: string;
  paperEvidencePaths?: string[];
  paperAnnotationsBlock?: string;
  paperAnnotationsBlocks?: string[];
  promptInput: string;
  /** Resolved from PROMPT_TEMPLATES if promptInput is a key, otherwise equals promptInput */
  taskInstruction: string;
  notesDir: string;
  noteFilename: string;
  conversationHistory?: ThreadMessage[];
}

/** Defines how a particular task type behaves */
export interface TaskConfig {
  taskType: TaskType;
  agentOptions: AgentOptions;
  buildPrompt: (context: PromptContext) => string;
  displayLabel: string;
}

/** Fully resolved config ready for the executor */
export interface ResolvedAgentQuery {
  prompt: string;
  cwd: string;
  options: AgentOptions;
  displayCommand: string;
}
