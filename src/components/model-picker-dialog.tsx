"use client";

import {
  Check,
  CircleAlert,
  Coins,
  Cpu,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatModelPrice,
  formatModelTokenCount,
  getModelLabel,
} from "@/lib/models";
import { useModelPicker } from "@/hooks/use-model-picker";

interface ModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  disabled?: boolean;
}

function formatLastUpdated(timestamp?: number) {
  if (!timestamp) return "Not cached yet";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function formatAvailabilityNote(
  availability: "available" | "unavailable" | "unknown",
) {
  if (availability === "unavailable") {
    return "Not available for the current OpenRouter key";
  }
  if (availability === "unknown") {
    return "Metadata unavailable";
  }
  return null;
}

export function ModelPickerDialog({
  open,
  onOpenChange,
  selectedModel,
  onSelectModel,
  disabled,
}: ModelPickerDialogProps) {
  const { models, cache, isRefreshing, refreshError } = useModelPicker(open);
  const selectedLabel = getModelLabel(selectedModel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/40 px-6 py-5">
          <DialogTitle>Choose model</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>Metadata from OpenRouter for the models available in chat.</span>
            {isRefreshing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Refreshing
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-3 px-4 py-4 sm:px-6">
            {[...models].sort((a, b) => {
              if (a.id === selectedModel) return -1;
              if (b.id === selectedModel) return 1;
              return 0;
            }).map((model) => {
              const selected = model.id === selectedModel;
              const disabledCard = disabled || model.availability === "unavailable";
              const availabilityNote = formatAvailabilityNote(model.availability);

              return (
                <button
                  key={model.id}
                  type="button"
                  disabled={disabledCard}
                  onClick={() => {
                    onSelectModel(model.id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "group w-full rounded-xl border px-4 py-4 text-left transition-all duration-200",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    selected
                      ? "border-primary/50 bg-primary/5 shadow-md shadow-primary/5"
                      : "border-border/40 bg-card/40 hover:border-primary/20 hover:bg-card/80",
                    disabledCard &&
                      "cursor-not-allowed opacity-60 hover:border-border/40 hover:bg-card/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {model.label}
                        </span>
                        {selected ? (
                          <Badge variant="secondary" className="gap-1">
                            <Check className="h-3 w-3" />
                            Selected
                          </Badge>
                        ) : null}
                        {model.availability === "unavailable" ? (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Unavailable
                          </Badge>
                        ) : null}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {model.effectiveModelId}
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      {selected ? `Current: ${selectedLabel}` : "Select model"}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-xs text-foreground sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg bg-muted/15 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Cpu className="h-3.5 w-3.5" />
                        Context
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formatModelTokenCount(model.contextLength)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/15 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        Max output
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formatModelTokenCount(model.maxCompletionTokens)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/15 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Coins className="h-3.5 w-3.5" />
                        Input
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formatModelPrice(model.promptPricePerMillionUsd)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/15 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Coins className="h-3.5 w-3.5" />
                        Output
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formatModelPrice(model.completionPricePerMillionUsd)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {model.inputModalities.map((modality) => (
                      <Badge
                        key={`in-${model.id}-${modality}`}
                        variant="outline"
                        className="text-[11px] text-muted-foreground"
                      >
                        In: {modality}
                      </Badge>
                    ))}
                    {model.outputModalities.map((modality) => (
                      <Badge
                        key={`out-${model.id}-${modality}`}
                        variant="outline"
                        className="text-[11px] text-muted-foreground"
                      >
                        Out: {modality}
                      </Badge>
                    ))}
                    {model.inputModalities.length === 0 &&
                    model.outputModalities.length === 0 ? (
                      <Badge
                        variant="outline"
                        className="text-[11px] text-muted-foreground"
                      >
                        Modalities unavailable
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {model.description ?? "No description available from OpenRouter."}
                    </p>
                    {availabilityNote ? (
                      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CircleAlert className="h-3.5 w-3.5" />
                        {availabilityNote}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <div className="border-t border-border/40 bg-muted/5 px-6 py-4 text-xs text-muted-foreground">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Metadata from OpenRouter. Last updated {formatLastUpdated(cache.fetchedAt)}.
            </span>
            {cache.isStale ? <span>Cache is stale and will refresh on open.</span> : null}
          </div>
          {cache.lastError || refreshError ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-destructive">
              <CircleAlert className="h-3.5 w-3.5" />
              {refreshError ?? cache.lastError}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
