import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedAgentQuery } from "./types";

export function executeAgentQuery(
  resolved: ResolvedAgentQuery,
  abortController: AbortController
): Query {
  return query({
    prompt: resolved.prompt,
    options: {
      cwd: resolved.cwd,
      model: resolved.options.model,
      tools: resolved.options.tools,
      allowedTools: resolved.options.allowedTools,
      maxTurns: resolved.options.maxTurns,
      systemPrompt: resolved.options.systemPrompt,
      resume: resolved.options.resume,
      sessionId: resolved.options.sessionId,
      continue: resolved.options.continue,
      persistSession: resolved.options.persistSession,
      includePartialMessages: resolved.options.includePartialMessages,
      // Only pass thinking for models that support it (not haiku)
      ...(resolved.options.thinking && resolved.options.model !== "haiku"
        ? { thinking: resolved.options.thinking }
        : {}),
      abortController,
    },
  });
}
