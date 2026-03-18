import type { ImportState, ImportStage } from "@/types";

const IMPORT_STAGES: Set<string> = new Set([
  "queued",
  "downloading_pdf",
  "downloading_source",
  "building_index",
  "generating_summary",
]);

export function parseImportStatus(raw: string | undefined): ImportState {
  if (!raw || raw === "completed") {
    return { phase: "completed" };
  }
  if (raw.startsWith("failed")) {
    const error = raw.startsWith("failed: ") ? raw.slice(8) : raw.slice(7) || "Unknown error";
    return { phase: "failed", error };
  }
  if (IMPORT_STAGES.has(raw)) {
    return { phase: "importing", stage: raw as ImportStage };
  }
  return { phase: "importing", stage: "queued" };
}

const STAGE_LABELS: Record<ImportStage, string> = {
  queued: "Queued",
  downloading_pdf: "Downloading PDF",
  downloading_source: "Downloading source",
  building_index: "Indexing",
  generating_summary: "Summarizing",
};

export function stageLabel(stage: ImportStage): string {
  return STAGE_LABELS[stage];
}

export function importStateSortKey(state: ImportState): number {
  if (state.phase === "failed") return 0;
  if (state.phase === "importing") return 1;
  return 2;
}
