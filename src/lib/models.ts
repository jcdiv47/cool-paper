export type ModelId = "haiku" | "sonnet" | "opus";

export const MODEL_OPTIONS: { id: ModelId; label: string; description: string }[] = [
  { id: "haiku",  label: "Haiku",  description: "Fast" },
  { id: "sonnet", label: "Sonnet", description: "Balanced" },
  { id: "opus",   label: "Opus",   description: "Powerful" },
];

export const DEFAULT_MODEL: ModelId = "haiku";
