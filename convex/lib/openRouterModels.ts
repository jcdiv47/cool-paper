import { v } from "convex/values";
import { MODEL_OPTIONS, type ModelOption } from "./modelConfig";

export const OPENROUTER_MODEL_CACHE_KEY = "openrouter-models-user-v1";
export const OPENROUTER_MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type ModelPickerAvailability =
  | "available"
  | "unavailable"
  | "unknown";

export interface ModelPickerModel {
  id: string;
  label: string;
  effectiveModelId: string;
  description?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  promptPricePerMillionUsd?: number;
  completionPricePerMillionUsd?: number;
  inputModalities: string[];
  outputModalities: string[];
  availability: ModelPickerAvailability;
}

export interface ModelPickerCacheState {
  fetchedAt?: number;
  expiresAt?: number;
  isStale: boolean;
  lastError?: string;
}

export interface ModelPickerQueryResult {
  models: ModelPickerModel[];
  cache: ModelPickerCacheState;
}

export interface RefreshModelMetadataResult {
  refreshed: boolean;
  fetchedAt?: number;
  cacheHit: boolean;
  error?: string;
}

export interface NormalizedModelMetadataEntry {
  modelId: string;
  name: string;
  description?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  promptPricePerMillionUsd?: number;
  completionPricePerMillionUsd?: number;
  requestPriceUsd?: number;
  inputModalities: string[];
  outputModalities: string[];
  tokenizer?: string;
  instructType?: string;
}

export const normalizedModelMetadataEntryValidator = v.object({
  modelId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  contextLength: v.optional(v.number()),
  maxCompletionTokens: v.optional(v.number()),
  promptPricePerMillionUsd: v.optional(v.number()),
  completionPricePerMillionUsd: v.optional(v.number()),
  requestPriceUsd: v.optional(v.number()),
  inputModalities: v.array(v.string()),
  outputModalities: v.array(v.string()),
  tokenizer: v.optional(v.string()),
  instructType: v.optional(v.string()),
});

export const modelPickerAvailabilityValidator = v.union(
  v.literal("available"),
  v.literal("unavailable"),
  v.literal("unknown"),
);

export const modelPickerModelValidator = v.object({
  id: v.string(),
  label: v.string(),
  effectiveModelId: v.string(),
  description: v.optional(v.string()),
  contextLength: v.optional(v.number()),
  maxCompletionTokens: v.optional(v.number()),
  promptPricePerMillionUsd: v.optional(v.number()),
  completionPricePerMillionUsd: v.optional(v.number()),
  inputModalities: v.array(v.string()),
  outputModalities: v.array(v.string()),
  availability: modelPickerAvailabilityValidator,
});

export const modelPickerCacheStateValidator = v.object({
  fetchedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  isStale: v.boolean(),
  lastError: v.optional(v.string()),
});

export const modelPickerQueryResultValidator = v.object({
  models: v.array(modelPickerModelValidator),
  cache: modelPickerCacheStateValidator,
});

interface OpenRouterPricing {
  prompt?: unknown;
  completion?: unknown;
  request?: unknown;
}

interface OpenRouterArchitecture {
  input_modalities?: unknown;
  output_modalities?: unknown;
  tokenizer?: unknown;
  instruct_type?: unknown;
}

interface OpenRouterTopProvider {
  max_completion_tokens?: unknown;
}

interface OpenRouterModel {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  pricing?: OpenRouterPricing;
  architecture?: OpenRouterArchitecture;
  top_provider?: OpenRouterTopProvider;
}

export function getOpenRouterBaseUrl() {
  return (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1")
    .replace(/\/+$/, "");
}

export function getOpenRouterHeaders(apiKey: string) {
  const referer =
    process.env.OPENROUTER_HTTP_REFERER ??
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const title = process.env.OPENROUTER_APP_TITLE ?? "cool-paper";

  return {
    Authorization: `Bearer ${apiKey}`,
    ...(referer ? { "HTTP-Referer": referer } : {}),
    ...(title ? { "X-Title": title } : {}),
  };
}

export function resolveEffectiveModelId(option: ModelOption): string {
  if (option.envOverride) {
    const envVal = process.env[option.envOverride]?.trim();
    if (envVal) return envVal;
  }
  return option.modelId;
}

export function getConfiguredModelsWithEffectiveIds() {
  return MODEL_OPTIONS.map((option) => ({
    ...option,
    effectiveModelId: resolveEffectiveModelId(option),
  }));
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeModalities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && !!item.trim());
}

function normalizePricePerMillionUsd(value: unknown) {
  const pricePerToken = normalizeOptionalNumber(value);
  if (pricePerToken === undefined) return undefined;
  return pricePerToken * 1_000_000;
}

export function normalizeOpenRouterModel(
  raw: OpenRouterModel,
): NormalizedModelMetadataEntry | null {
  const modelId = normalizeOptionalString(raw.id);
  if (!modelId) return null;

  return {
    modelId,
    name: normalizeOptionalString(raw.name) ?? modelId,
    description: normalizeOptionalString(raw.description),
    contextLength: normalizeOptionalNumber(raw.context_length),
    maxCompletionTokens: normalizeOptionalNumber(
      raw.top_provider?.max_completion_tokens,
    ),
    promptPricePerMillionUsd: normalizePricePerMillionUsd(raw.pricing?.prompt),
    completionPricePerMillionUsd: normalizePricePerMillionUsd(
      raw.pricing?.completion,
    ),
    requestPriceUsd: normalizeOptionalNumber(raw.pricing?.request),
    inputModalities: normalizeModalities(raw.architecture?.input_modalities),
    outputModalities: normalizeModalities(raw.architecture?.output_modalities),
    tokenizer: normalizeOptionalString(raw.architecture?.tokenizer),
    instructType: normalizeOptionalString(raw.architecture?.instruct_type),
  };
}
