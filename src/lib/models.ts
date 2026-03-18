import {
  MODEL_OPTIONS,
  DEFAULT_MODEL,
  type ModelOption,
} from "../../convex/lib/modelConfig";

export { MODEL_OPTIONS, DEFAULT_MODEL, type ModelOption };

export function getModelOption(modelId?: string) {
  if (!modelId) return undefined;
  return MODEL_OPTIONS.find((model) => model.id === modelId);
}

export function getModelLabel(modelId?: string) {
  if (!modelId) return "";
  return getModelOption(modelId)?.label ?? modelId;
}

export function formatModelTokenCount(value?: number) {
  if (!value || !Number.isFinite(value)) return "Unavailable";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatModelPrice(priceUsdPerMillion?: number) {
  if (priceUsdPerMillion === undefined || !Number.isFinite(priceUsdPerMillion)) {
    return "Unavailable";
  }
  if (priceUsdPerMillion >= 1) {
    return `$${priceUsdPerMillion.toFixed(2).replace(/\.00$/, "")}/M`;
  }
  if (priceUsdPerMillion >= 0.01) {
    return `$${priceUsdPerMillion.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}/M`;
  }
  return `$${priceUsdPerMillion.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}/M`;
}
