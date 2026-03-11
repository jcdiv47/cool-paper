"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Copy, Check, Terminal, PenLine } from "lucide-react";
import { QUICK_PROMPTS, PROMPT_TEMPLATES } from "@/lib/quick-prompts";
import { MODEL_OPTIONS, DEFAULT_MODEL } from "@/lib/models";
import type { PaperMetadata } from "@/types";
import type { TaskType } from "@/lib/agent";

interface GenerateNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paper: PaperMetadata;
  generating: boolean;
  output: string;
  cliCommand: string;
  onStartJob: (prompt: string, noteFilename: string, taskType?: TaskType, model?: string) => void;
  onCancelJob: () => void;
}

export function GenerateNoteDialog({
  open,
  onOpenChange,
  paper,
  generating,
  output,
  cliCommand,
  onStartJob,
  onCancelJob,
}: GenerateNoteDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [noteFilename, setNoteFilename] = useState("summary.md");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  function handleQuickPrompt(value: string) {
    setPrompt(PROMPT_TEMPLATES[value] || value);
    setNoteFilename(`${value}.md`);
  }

  function handleGenerate() {
    if (!prompt.trim()) return;
    onStartJob(prompt.trim(), noteFilename, undefined, model);
  }

  async function handleCopyCommand() {
    if (!cliCommand) return;
    await navigator.clipboard.writeText(cliCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Generate Note</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {paper.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* Quick prompts */}
          <div className="space-y-2">
            <Label>Quick Prompts</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((qp) => (
                <Badge
                  key={qp.value}
                  variant={prompt === (PROMPT_TEMPLATES[qp.value] || qp.value) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => handleQuickPrompt(qp.value)}
                >
                  {qp.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Custom prompt */}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the AI to analyze..."
              rows={3}
              disabled={generating}
            />
          </div>

          {/* Filename */}
          <div className="space-y-2">
            <Label htmlFor="filename">Filename</Label>
            <Input
              id="filename"
              value={noteFilename}
              onChange={(e) => setNoteFilename(e.target.value)}
              disabled={generating}
            />
          </div>

          {/* Output */}
          {(output || cliCommand || generating) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  Output
                </Label>
                {cliCommand && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={handleCopyCommand}
                  >
                    {copied ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copy CLI Command
                  </Button>
                )}
              </div>
              <div className="h-32 overflow-y-auto rounded-md border border-border/40 bg-muted/30 sm:h-48">
                <pre
                  ref={outputRef}
                  className="p-3 text-xs font-mono whitespace-pre-wrap break-all h-full overflow-y-auto"
                >
                  {output || (generating ? "Starting agent..." : "Waiting for output...")}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
          <Select value={model} onValueChange={setModel} disabled={generating}>
            <SelectTrigger size="sm" className="w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                  <span className="ml-1 text-muted-foreground">{m.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          {generating ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button variant="destructive" size="sm" onClick={onCancelJob}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
              >
                <PenLine className="mr-1.5 h-3.5 w-3.5" />
                Generate
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
