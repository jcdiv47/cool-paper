"use client";

import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { MODEL_OPTIONS } from "@/lib/models";

export function useModelPicker(open: boolean) {
  const pickerState = useQuery(api.modelMetadata.listForPicker, {});
  const refreshIfStale = useAction(api.actions.modelMetadata.refreshIfStale);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestedForOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      requestedForOpenRef.current = false;
      return;
    }

    if (requestedForOpenRef.current) return;
    requestedForOpenRef.current = true;

    let cancelled = false;
    const refresh = async () => {
      setIsRefreshing(true);
      setRefreshError(null);

      try {
        const result = await refreshIfStale({});
        if (!cancelled && result.error) {
          setRefreshError(result.error);
        }
      } catch (error) {
        if (!cancelled) {
          setRefreshError(
            error instanceof Error
              ? error.message
              : "Failed to refresh model metadata",
          );
        }
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    };

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [open, refreshIfStale]);

  return {
    models:
      pickerState?.models ??
      MODEL_OPTIONS.map((model) => ({
        id: model.id,
        label: model.label,
        effectiveModelId: model.id,
        contextLength: undefined,
        maxCompletionTokens: undefined,
        promptPricePerMillionUsd: undefined,
        completionPricePerMillionUsd: undefined,
        description: undefined,
        inputModalities: [],
        outputModalities: [],
        availability: "unknown" as const,
      })),
    cache: pickerState?.cache ?? {
      fetchedAt: undefined,
      expiresAt: undefined,
      isStale: true,
      lastError: undefined,
    },
    isRefreshing,
    refreshError,
  };
}
