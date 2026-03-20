"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import {
  Send,
  Square,
  MessageCircle,
  ChevronRight,
  Brain,
  LoaderCircle,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { getModelLabel } from "@/lib/models";
import { PaperCardRow } from "@/components/paper-card-row";
import {
  CitationMarkdown,
  type AnnotationTarget,
  type CitationTarget,
} from "@/components/citation-markdown";
import { parseAnnotationTokens } from "@/lib/annotation-links";
import { parseCitationTokens } from "@/lib/citations";
import { ModelPickerDialog } from "@/components/model-picker-dialog";
import { api } from "../../convex/_generated/api";
import type { ThreadMessage, PaperMetadata } from "@/types";

interface ChatViewProps {
  messages: ThreadMessage[];
  streamingMessage: ThreadMessage | null;
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
  onNavigate?: (href: string) => void;
  hidePaperCards?: boolean;
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
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(false);
  const lastThinkingScrollTopRef = useRef(0);

  // Auto behavior: expand while actively thinking with content, collapse when done
  const autoOpen = isActivelyThinking && !!thinking;
  const isOpen = manualOpen ?? autoOpen;

  const scrollThinkingToBottom = useCallback(() => {
    const el = thinkingScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastThinkingScrollTopRef.current = el.scrollTop;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stickToBottomRef.current = false;
      lastThinkingScrollTopRef.current = 0;
      return;
    }

    const el = thinkingScrollRef.current;
    if (!el) return;
    lastThinkingScrollTopRef.current = el.scrollTop;
  }, [isOpen]);

  useEffect(() => {
    if (!isActivelyThinking || !isOpen || !stickToBottomRef.current) {
      return;
    }

    let rafId = 0;
    rafId = window.requestAnimationFrame(() => {
      scrollThinkingToBottom();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [isActivelyThinking, isOpen, thinking, scrollThinkingToBottom]);

  const handleThinkingScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      const scrollingDown = el.scrollTop > lastThinkingScrollTopRef.current;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;

      if (scrollingDown && nearBottom) {
        stickToBottomRef.current = true;
      }

      lastThinkingScrollTopRef.current = el.scrollTop;
    },
    []
  );

  // Working state: no thinking content yet, just show activity indicator
  if (isActivelyThinking && !thinking) {
    return (
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="h-3.5 w-3.5" />
        <span>Thinking…</span>
        <LoaderCircle className="h-3 w-3 animate-spin" />
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
        {isActivelyThinking && (
          <LoaderCircle className="h-3 w-3 animate-spin" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          ref={thinkingScrollRef}
          onScroll={handleThinkingScroll}
          className="mt-2 max-h-60 overflow-y-auto rounded-md border border-border/30 bg-muted/15 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground"
        >
          {thinking}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssistantMessage({
  message,
  isMultiPaper,
  citationTargets,
  annotationTargets,
  onNavigate,
}: {
  message: ThreadMessage;
  isMultiPaper: boolean;
  citationTargets: Record<string, CitationTarget>;
  annotationTargets: Record<string, AnnotationTarget>;
  onNavigate?: (href: string) => void;
}) {
  return (
    <div className="w-full">
      {message.model && (
        <span className="mb-1 block text-[10px] text-muted-foreground/50">
          {getModelLabel(message.model)}
        </span>
      )}
      {message.thinking ? (
        <ThinkingCard
          thinking={message.thinking}
          isActivelyThinking={false}
        />
      ) : null}
      {message.content ? (
        <article className="prose prose-zinc prose-invert prose-chat prose-sm max-w-none font-serif">
          <CitationMarkdown
            content={message.content}
            targets={citationTargets}
            annotationTargets={annotationTargets}
            showPaperLabel={isMultiPaper}
            onNavigate={onNavigate}
          />
        </article>
      ) : null}
    </div>
  );
}

function StreamingAssistantMessage({
  message,
  isThinking,
  showCursor,
  isMultiPaper,
  citationTargets,
  annotationTargets,
  onNavigate,
}: {
  message: ThreadMessage;
  isThinking: boolean;
  showCursor: boolean;
  isMultiPaper: boolean;
  citationTargets: Record<string, CitationTarget>;
  annotationTargets: Record<string, AnnotationTarget>;
  onNavigate?: (href: string) => void;
}) {
  return (
    <div className="w-full">
      {message.model && (
        <span className="mb-1 block text-[10px] text-muted-foreground/50">
          {getModelLabel(message.model)}
        </span>
      )}
      <ThinkingCard
        thinking={message.thinking}
        isActivelyThinking={isThinking}
      />
      {message.content ? (
        <article className={`prose prose-zinc prose-invert prose-chat prose-sm max-w-none font-serif${showCursor ? ' streaming-cursor' : ''}`}>
          <CitationMarkdown
            content={message.content}
            targets={citationTargets}
            annotationTargets={annotationTargets}
            showPaperLabel={isMultiPaper}
            onNavigate={onNavigate}
            sanitizePartial
          />
        </article>
      ) : !isThinking ? (
        <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-foreground/60" />
      ) : null}
    </div>
  );
}

export function ChatView({
  messages,
  streamingMessage,
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
  onNavigate,
  hidePaperCards,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUp = useRef(false);
  const lastScrollTop = useRef(0);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const justSubmittedRef = useRef(false);

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
    if (userScrolledUp.current) return;
    if (!scrollRef.current) return;

    let rafId = 0;
    rafId = window.requestAnimationFrame(() => {
      if (!scrollRef.current) return;

      if (justSubmittedRef.current && lastUserMsgRef.current) {
        // Scroll so the newest user turn lands near the top of the viewport.
        scrollRef.current.scrollTop = lastUserMsgRef.current.offsetTop - 24;
        justSubmittedRef.current = false;
        return;
      }

      // During streaming, keep the viewport pinned to the latest content.
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [
    isStreaming,
    isThinking,
    messages,
    streamingMessage?.content,
    streamingMessage?.thinking,
  ]);

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
    justSubmittedRef.current = true;
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
  const lastUserMessageIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  }, [messages]);
  const citationRefIds = useMemo(
    () =>
      [
        ...new Set(
          [...messages, ...(streamingMessage ? [streamingMessage] : [])].flatMap(
            (msg) =>
              parseCitationTokens(msg.content).map((citation) => citation.refId)
          )
        ),
      ],
    [messages, streamingMessage]
  );
  const annotationIds = useMemo(
    () =>
      [
        ...new Set(
          [...messages, ...(streamingMessage ? [streamingMessage] : [])].flatMap(
            (msg) =>
              parseAnnotationTokens(msg.content).map(
                (annotation) => annotation.annotationId
              )
          )
        ),
      ],
    [messages, streamingMessage]
  );
  const citationTargetsResult = useQuery(
    api.paperChunks.resolveAcrossSanitizedIds,
    citationRefIds.length > 0 && papers && papers.length > 0
      ? {
          sanitizedIds: papers.map((paper) => paper.arxivId.replace(/\//g, "_")),
          refIds: citationRefIds,
        }
      : "skip"
  );
  const annotationTargetsResult = useQuery(
    api.annotations.resolveAcrossSanitizedIds,
    annotationIds.length > 0 && papers && papers.length > 0
      ? {
          sanitizedIds: papers.map((paper) => paper.arxivId.replace(/\//g, "_")),
          annotationIds,
        }
      : "skip"
  );
  const citationTargets = useMemo<Record<string, CitationTarget>>(
    () =>
      Object.fromEntries(
        (citationTargetsResult ?? []).map((chunk) => [
          chunk.refId,
          {
            refId: chunk.refId,
            page: chunk.page,
            sanitizedId: chunk.sanitizedId,
            section: chunk.section,
          },
        ])
      ),
    [citationTargetsResult]
  );
  const annotationTargets = useMemo<Record<string, AnnotationTarget>>(
    () =>
      Object.fromEntries(
        (annotationTargetsResult ?? []).map((annotation) => [
          annotation.annotationId,
          {
            annotationId: annotation.annotationId,
            page: annotation.page,
            sanitizedId: annotation.sanitizedId,
            kind: annotation.kind,
            comment: annotation.comment,
            exact: annotation.exact,
          },
        ])
      ),
    [annotationTargetsResult]
  );
  const suggestions = isMultiPaper ? MULTI_SUGGESTIONS : SINGLE_SUGGESTIONS;
  const placeholderText = isMultiPaper
    ? "Ask about these papers…"
    : "Ask about this paper…";
  const emptyHeading = isMultiPaper
    ? "Ask about these papers"
    : "Ask anything about this paper";
  const hasConversation =
    messages.length > 0 || Boolean(streamingMessage) || isStreaming;
  const renderedMessages = useMemo(
    () =>
      messages.map((msg, i) => (
        <div
          key={`${msg.timestamp}-${msg.role}-${i}`}
          ref={i === lastUserMessageIndex && msg.role === "user" ? lastUserMsgRef : undefined}
        >
          {msg.role === "user" ? (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg border-l-2 border-primary/30 bg-primary/8 px-4 py-2.5">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {msg.content}
                </p>
              </div>
            </div>
          ) : (
            <AssistantMessage
              message={msg}
              isMultiPaper={Boolean(isMultiPaper)}
              citationTargets={citationTargets}
              annotationTargets={annotationTargets}
              onNavigate={onNavigate}
            />
          )}
        </div>
      )),
    [
      annotationTargets,
      citationTargets,
      isMultiPaper,
      lastUserMessageIndex,
      messages,
      onNavigate,
    ]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Paper cards row */}
      {!hidePaperCards && papers && papers.length > 0 && onRemovePaper && onAddPaperClick && (
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
          {!hasConversation ? (
            <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/30" />
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
              {renderedMessages}
              {streamingMessage ? (
                <StreamingAssistantMessage
                  message={streamingMessage}
                  isThinking={isThinking}
                  showCursor={isStreaming && !isThinking}
                  isMultiPaper={Boolean(isMultiPaper)}
                  citationTargets={citationTargets}
                  annotationTargets={annotationTargets}
                  onNavigate={onNavigate}
                />
              ) : isStreaming ? (
                <div className="w-full">
                  <ThinkingCard isActivelyThinking={true} />
                </div>
              ) : null}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-[4px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border/40 bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-8">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0 gap-2 rounded-[6px] px-3 text-left"
            onClick={() => setModelPickerOpen(true)}
            disabled={isStreaming}
          >
            <div className="text-xs font-medium">{getModelLabel(model)}</div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
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
            className="min-h-[40px] max-h-[160px] flex-1 resize-none rounded-[6px] border border-border bg-secondary px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:bg-background"
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
      <ModelPickerDialog
        open={modelPickerOpen}
        onOpenChange={setModelPickerOpen}
        selectedModel={model}
        onSelectModel={onModelChange}
        disabled={isStreaming}
      />
    </div>
  );
}
