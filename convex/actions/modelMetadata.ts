"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import {
  getOpenRouterBaseUrl,
  getOpenRouterHeaders,
  normalizeOpenRouterModel,
  type ModelPickerQueryResult,
  type RefreshModelMetadataResult,
  OPENROUTER_MODEL_CACHE_KEY,
  OPENROUTER_MODEL_CACHE_TTL_MS,
} from "../lib/openRouterModels";

interface OpenRouterModelsResponse {
  data?: unknown;
}

export const refreshIfStale = action({
  args: {},
  returns: v.object({
    refreshed: v.boolean(),
    fetchedAt: v.optional(v.number()),
    cacheHit: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<RefreshModelMetadataResult> => {
    const pickerState: ModelPickerQueryResult = await ctx.runQuery(
      api.modelMetadata.listForPicker,
      {},
    );
    if (!pickerState.cache.isStale && pickerState.cache.fetchedAt) {
      return {
        refreshed: false,
        fetchedAt: pickerState.cache.fetchedAt,
        cacheHit: true,
        error: undefined,
      };
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      const error = "OPENROUTER_API_KEY is not configured";
      await ctx.runMutation(internal.modelMetadata.upsertCache, {
        cacheKey: OPENROUTER_MODEL_CACHE_KEY,
        lastError: error,
      });
      return {
        refreshed: false,
        fetchedAt: pickerState.cache.fetchedAt,
        cacheHit: Boolean(pickerState.cache.fetchedAt),
        error,
      };
    }

    try {
      const response = await fetch(`${getOpenRouterBaseUrl()}/models/user`, {
        headers: getOpenRouterHeaders(apiKey),
      });

      if (!response.ok) {
        throw new Error(
          `OpenRouter returned ${response.status} ${response.statusText}`,
        );
      }

      const body = (await response.json()) as OpenRouterModelsResponse;
      const rawModels = Array.isArray(body.data) ? body.data : [];
      const entries = rawModels
        .map((model) => normalizeOpenRouterModel(model as Record<string, unknown>))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      const fetchedAt = Date.now();
      await ctx.runMutation(internal.modelMetadata.upsertCache, {
        cacheKey: OPENROUTER_MODEL_CACHE_KEY,
        entries,
        fetchedAt,
        expiresAt: fetchedAt + OPENROUTER_MODEL_CACHE_TTL_MS,
        lastError: null,
      });

      return {
        refreshed: true,
        fetchedAt,
        cacheHit: false,
        error: undefined,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to refresh model metadata";

      await ctx.runMutation(internal.modelMetadata.upsertCache, {
        cacheKey: OPENROUTER_MODEL_CACHE_KEY,
        lastError: message,
      });

      return {
        refreshed: false,
        fetchedAt: pickerState.cache.fetchedAt,
        cacheHit: Boolean(pickerState.cache.fetchedAt),
        error: message,
      };
    }
  },
});
