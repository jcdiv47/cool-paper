"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Send, Square, MessageCircle, ChevronRight, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { MODEL_OPTIONS } from "@/lib/models";
import { PaperCardRow } from "@/components/paper-card-row";
import type { ThreadMessage, PaperMetadata } from "@/types";

interface ChatViewProps {
  messages: ThreadMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  error: string | null;
  onSendMessage: (content: string) => void;
  onCancel: () => void;
  model: string;
  onModelChange: (model: string) => void;
  papers?: PaperMetadata[];
  onRemovePaper?: (paperId: string) => void;
  onAddPaperClick?: () => void;
}

const SINGLE_SUGGESTIONS = [
  "Explain the main contribution",
  "What are the key assumptions?",
  "Summarize the methodology",
  "What are the limitations?",
];

const MULTI_SUGGESTIONS = [
  "Compare the methodologies",
  "What are the key differences?",
  "How do the results relate?",
  "Summarize common themes",
];

function ThinkingCard({
  thinking,
  isActivelyThinking,
}: {
  thinking?: string;
  isActivelyThinking: boolean;
}) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  // Auto behavior: expand while actively thinking with content, collapse when done
  const autoOpen = isActivelyThinking && !!thinking;
  const isOpen = manualOpen ?? autoOpen;

  // Reset manual override when a new thinking session starts
  useEffect(() => {
    if (isActivelyThinking) {
      setManualOpen(null);
    }
  }, [isActivelyThinking]);

  // Working state: no thinking content yet, just show activity indicator
  if (isActivelyThinking && !thinking) {
    return (
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="h-3.5 w-3.5" />
        <span>
          Working
          <span className="inline-flex w-4">
            <span className="animate-pulse">...</span>
          </span>
        </span>
      </div>
    );
  }

  // No thinking content and not actively thinking — nothing to show
  if (!thinking) return null;

  const label = isActivelyThinking ? "Thinking…" : "Thought process";

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={(open) => setManualOpen(open)}
      className="mb-3"
    >
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight
          className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
        <Brain className="h-3.5 w-3.5" />
        <span>{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
          {thinking}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ChatView({
  messages,
  isStreaming,
  isThinking,
  error,
  onSendMessage,
  onCancel,
  model,
  onModelChange,
  papers,
  onRemovePaper,
  onAddPaperClick,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUp = useRef(false);
  const lastScrollTop = useRef(0);

  // Auto-scroll during streaming, but pause if user scrolls up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      if (!el) return;
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      // If user scrolled up while streaming, respect that
      if (el.scrollTop < lastScrollTop.current && !atBottom) {
        userScrolledUp.current = true;
      }
      if (atBottom) {
        userScrolledUp.current = false;
      }
      lastScrollTop.current = el.scrollTop;
    }

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  function handleSubmit() {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput("");
    userScrolledUp.current = false;
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const isMultiPaper = papers && papers.length > 1;
  const suggestions = isMultiPaper ? MULTI_SUGGESTIONS : SINGLE_SUGGESTIONS;
  const placeholderText = isMultiPaper
    ? "Ask about these papers…"
    : "Ask about this paper…";
  const emptyHeading = isMultiPaper
    ? "Ask about these papers"
    : "Ask anything about this paper";

  return (
    <div className="flex h-full flex-col">
      {/* Paper cards row */}
      {papers && papers.length > 0 && onRemovePaper && onAddPaperClick && (
        <div className="border-b border-border/40">
          <div className="mx-auto max-w-3xl">
            <PaperCardRow
              papers={papers}
              onRemove={onRemovePaper}
              onAddClick={onAddPaperClick}
            />
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center bg-secondary">
                <MessageCircle className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-base font-semibold text-foreground">
                  {emptyHeading}
                </p>
                <p className="text-sm text-muted-foreground">
                  The AI can read paper source files to answer your questions
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    onClick={() => onSendMessage(s)}
                    className="border-border font-normal text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => {
                const isLastMessage = i === messages.length - 1;
                const isActiveAssistant =
                  msg.role === "assistant" && isLastMessage && isStreaming;

                return (
                  <div key={i}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] bg-primary/10 px-4 py-2.5">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full">
                        {msg.model && (
                          <span className="text-[10px] text-muted-foreground/50 mb-1 block">
                            {MODEL_OPTIONS.find((m) => m.id === msg.model)?.label ?? msg.model}
                          </span>
                        )}
                        {/* Thinking card: show during active thinking OR for completed messages with thinking */}
                        {(isActiveAssistant && (isThinking || msg.thinking)) ||
                        (!isActiveAssistant && msg.thinking) ? (
                          <ThinkingCard
                            thinking={msg.thinking}
                            isActivelyThinking={
                              isActiveAssistant && isThinking
                            }
                          />
                        ) : null}
                        {msg.content ? (
                          <article className="prose prose-zinc dark:prose-invert prose-chat prose-sm max-w-none font-serif">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeHighlight, rehypeKatex]}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </article>
                        ) : isStreaming && isLastMessage && !isThinking ? (
                          <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/60 rounded-sm" />
                        ) : null}
                        {isStreaming &&
                          isLastMessage &&
                          !isThinking &&
                          msg.content && (
                            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/60 rounded-sm align-text-bottom" />
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border/40 bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-8">
          <Select value={model} onValueChange={onModelChange} disabled={isStreaming}>
            <SelectTrigger size="sm" className="w-auto text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" side="top">
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            rows={1}
            className="min-h-[40px] max-h-[160px] flex-1 resize-none rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:bg-background"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={onCancel}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className={`h-10 w-10 shrink-0 transition-colors ${input.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-transparent text-muted-foreground hover:bg-secondary"}`}
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
