"use client";

import { useCallback } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useDeletePaper() {
  const removePaper = useMutation(api.papers.removeBySanitizedId);

  return useCallback(
    async (sanitizedId: string) => {
      await removePaper({ sanitizedId });
    },
    [removePaper]
  );
}

export function useRetryImport() {
  const retry = useAction(api.actions.importPaper.retryImport);

  return useCallback(
    async (sanitizedId: string) => {
      await retry({ sanitizedId });
    },
    [retry]
  );
}
