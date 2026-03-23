/**
 * Shared model configuration — imported by both the Convex backend and the
 * Next.js frontend.  Edit this file to add, remove, or reorder models.
 *
 * `modelId` should be an OpenRouter model ID, e.g. "anthropic/claude-sonnet-4.6".
 *
 * Set `envOverride` to a Convex env-var name so you can swap the model at
 * runtime without a redeploy (npx convex env set MODEL_HAIKU ...).
 */

import type { OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";

/**
 * OpenRouter provider routing preferences — extracted from the SDK's own type
 * so it stays in sync automatically.
 * @see https://openrouter.ai/docs/guides/routing/provider-selection
 */
export type ProviderPreferences = NonNullable<
  OpenRouterChatSettings["provider"]
>;

export interface ModelOption {
  /** Alias stored in threads / passed through the API */
  id: string;
  /** Display name shown in the UI model selector */
  label: string;
  /** Default model ID for the provider */
  modelId: string;
  /** Optional Convex env-var that overrides `modelId` at runtime */
  envOverride?: string;
  /** OpenRouter provider routing preferences for this model */
  providerPreferences?: ProviderPreferences;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "anthropic/claude-haiku-4.5",
    label: "Haiku",
    modelId: "anthropic/claude-haiku-4.5",
    providerPreferences: {
      order: ["google-vertex"],
      allow_fallbacks: false,
      require_parameters: true,
    },
  },
  {
    id: "qwen/qwen3.5-35b-a3b",
    label: "Qwen3.5 35B A3B",
    modelId: "qwen/qwen3.5-35b-a3b",
    providerPreferences: {
      order: ["atlas-cloud/fp8", "alibaba", "parasail/fp8"],
      allow_fallbacks: false,
    }
  },
  {
    id: "qwen/qwen3.5-27b",
    label: "Qwen3.5 27B",
    modelId: "qwen/qwen3.5-27b",
    providerPreferences: {
      order: ["novita/bf16"],
      allow_fallbacks: false,
    }
  },
  {
    id: "qwen/qwen3-32b",
    label: "Qwen3 32B",
    modelId: "qwen/qwen3-32b",
    providerPreferences: {
      order: ["groq", "deepinfra/fp8", "alibaba"],
      allow_fallbacks: false,
    }
  },
  {
    id: "moonshotai/kimi-k2.5",
    label: "Kimi K2.5",
    modelId: "moonshotai/kimi-k2.5",
    providerPreferences: {
      order: ["inceptron/int4", "fireworks", "parasail/int4"],
      allow_fallbacks: false,
    }
  },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT OSS 120B",
    modelId: "openai/gpt-oss-120b",
    providerPreferences: {
      order: ["groq", "google-vertex", "amazon-bedrock"],
      allow_fallbacks: false,
    }
  },
];

export const DEFAULT_MODEL = "qwen/qwen3.5-35b-a3b";

// ---------------------------------------------------------------------------
// <think> tag parsing  —  Many open-weight models (Qwen, DeepSeek, …) wrap
// their reasoning in <think>…</think> tags as part of the normal text output.
// This utility extracts that content so we can show it in the ThinkingCard.
// ---------------------------------------------------------------------------

/**
 * Extract `<think>…</think>` blocks from text.
 *
 * Handles:
 *  - Multiple complete blocks
 *  - An unclosed `<think>` at the end (streaming in progress)
 *  - A partially-typed opening tag at the very tail (e.g. `<thi`)
 *
 * Returns the accumulated thinking text and the cleaned content.
 */
export function parseThinkTags(text: string): {
  thinking: string;
  content: string;
} {
  let thinking = "";
  let content = text;

  // 1. Extract complete <think>…</think> blocks
  content = content.replace(
    /<think>([\s\S]*?)<\/think>/g,
    (_match, inner: string) => {
      thinking += (thinking ? "\n" : "") + inner.trim();
      return "";
    },
  );

  // 2. Handle an unclosed <think> at the end (still streaming)
  const unclosed = content.match(/<think>([\s\S]*)$/);
  if (unclosed) {
    thinking += (thinking ? "\n" : "") + (unclosed[1] ?? "").trim();
    content = content.slice(0, unclosed.index);
  }

  // 3. Strip a partially-typed opening tag at the very tail
  content = content.replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, "");

  return { thinking, content: content.trim() };
}
