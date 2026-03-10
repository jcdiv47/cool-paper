import { useState, useEffect, useCallback, useRef } from "react";
import { getCached, setCached } from "@/lib/cache";

interface UseCachedFetchOptions {
  /** Cache key. If null/undefined, caching is skipped. */
  cacheKey?: string | null;
  /** If true, skip background revalidation (use cached data as-is). */
  cacheOnly?: boolean;
  /** Extra dependency that, when changed, triggers a refetch (e.g. notesKey). */
  invalidateKey?: number;
}

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  /** Manually trigger a refetch (bypasses cache). */
  refetch: () => Promise<void>;
}

export function useCachedFetch<T>(
  url: string | null,
  opts: UseCachedFetchOptions = {}
): UseCachedFetchResult<T> {
  const { cacheKey, cacheOnly = false, invalidateKey } = opts;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);

  // Track the latest url/invalidateKey to avoid stale responses
  const activeRef = useRef(0);

  const fetchData = useCallback(
    async (showLoading: boolean) => {
      if (!url) return;
      const id = ++activeRef.current;
      if (showLoading) setLoading(true);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (id !== activeRef.current) return; // stale
        setData(json);
        if (cacheKey) setCached(cacheKey, json);
      } catch {
        if (id !== activeRef.current) return;
        // If we have cached data, keep it; otherwise leave as null
      } finally {
        if (id === activeRef.current) setLoading(false);
      }
    },
    [url, cacheKey]
  );

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }

    const cached = cacheKey ? getCached<T>(cacheKey) : null;

    if (cached) {
      setData(cached.data);
      setLoading(false);
      if (!cacheOnly) {
        // Stale-while-revalidate: refetch in background
        fetchData(false);
      }
    } else {
      // No cache — fetch with loading indicator
      fetchData(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, cacheKey, cacheOnly, invalidateKey]);

  const refetch = useCallback(() => fetchData(true), [fetchData]);

  return { data, loading, refetch };
}
