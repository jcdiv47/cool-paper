import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getConfiguredModelsStatic,
  type ModelPickerAvailability,
  type ModelPickerQueryResult,
  modelPickerQueryResultValidator,
  normalizedModelMetadataEntryValidator,
  OPENROUTER_MODEL_CACHE_KEY,
} from "./lib/openRouterModels";

export const listForPicker = query({
  args: {},
  returns: modelPickerQueryResultValidator,
  handler: async (ctx): Promise<ModelPickerQueryResult> => {
    const cache = await ctx.db
      .query("model_metadata_cache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", OPENROUTER_MODEL_CACHE_KEY))
      .unique();

    const now = Date.now();
    const entryMap = new Map(
      (cache?.entries ?? []).map((entry) => [entry.modelId, entry]),
    );
    const hasSnapshot = Boolean(cache?.fetchedAt);

    return {
      models: getConfiguredModelsStatic().map((model) => {
        const metadata = entryMap.get(model.effectiveModelId);
        const availability: ModelPickerAvailability = hasSnapshot
          ? metadata
            ? "available"
            : "unavailable"
          : "unknown";

        return {
          id: model.id,
          label: model.label,
          effectiveModelId: model.effectiveModelId,
          description: metadata?.description,
          contextLength: metadata?.contextLength,
          maxCompletionTokens: metadata?.maxCompletionTokens,
          promptPricePerMillionUsd: metadata?.promptPricePerMillionUsd,
          completionPricePerMillionUsd: metadata?.completionPricePerMillionUsd,
          inputModalities: metadata?.inputModalities ?? [],
          outputModalities: metadata?.outputModalities ?? [],
          availability,
        };
      }),
      cache: {
        fetchedAt: cache?.fetchedAt || undefined,
        expiresAt: cache?.expiresAt || undefined,
        isStale: !cache || cache.expiresAt <= now,
        lastError: cache?.lastError,
      },
    };
  },
});

export const upsertCache = internalMutation({
  args: {
    cacheKey: v.string(),
    entries: v.optional(v.array(normalizedModelMetadataEntryValidator)),
    fetchedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    lastError: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("model_metadata_cache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();

    const patch = {
      entries: args.entries ?? existing?.entries ?? [],
      fetchedAt: args.fetchedAt ?? existing?.fetchedAt ?? 0,
      expiresAt: args.expiresAt ?? existing?.expiresAt ?? 0,
      lastError: args.lastError === null ? undefined : args.lastError,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("model_metadata_cache", {
        cacheKey: args.cacheKey,
        ...patch,
      });
    }

    return null;
  },
});
