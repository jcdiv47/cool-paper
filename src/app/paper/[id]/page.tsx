"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  use,
} from "react";
import {
  useRouter,
  useSearchParams,
  usePathname,
} from "next/navigation";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import {
  MessageCircle,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Link2,
  PanelLeftClose,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/header";
import { SummaryView } from "@/components/summary-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Toaster, toast } from "sonner";
import { PaperChatDrawer } from "@/components/paper-chat-drawer";
import { useDeletePaper, useRetryImport } from "@/hooks/use-paper-actions";
import { parseImportStatus, stageLabel } from "@/lib/import-status";
import type { PaperMetadata } from "@/types";

const WIDE_MEDIA_QUERY = "(min-width: 1440px)";

function PdfSkeleton() {
  return <div className="flex h-full items-center justify-center bg-muted/10 animate-pulse" />;
}

const LazyPdfViewer = dynamic(
  () => import("@/components/pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  { ssr: false, loading: () => <PdfSkeleton /> },
);

const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export default function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const isWide = useMediaQuery(WIDE_MEDIA_QUERY);
  // Mobile panel state — used for the bottom sheet approach on mobile
  const [mobilePanel, setMobilePanel] = useState<"chat" | null>(null);
  // Tracks the refId to scroll-to in chat (set by "Back to chat" button in PDF viewer)
  const [scrollToRefId, setScrollToRefId] = useState<string | undefined>(undefined);
  // Text selected in PDF to pre-fill chat input
  const [askAIText, setAskAIText] = useState<string | undefined>(undefined);
  // Paper delete undo timer
  const deletePaperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Persists summary scroll position across mode switches (survives SummaryView unmount/remount)
  const summaryScrollRef = useRef(0);

  const convexPaper = useQuery(api.papers.get, { sanitizedId: id });
  const loading = convexPaper === undefined;
  const paper: PaperMetadata | null = useMemo(
    () =>
      convexPaper
        ? {
            arxivId: convexPaper.arxivId,
            title: convexPaper.title,
            authors: convexPaper.authors,
            abstract: convexPaper.abstract,
            summary: convexPaper.summary,
            published: convexPaper.published,
            categories: convexPaper.categories,
            addedAt: convexPaper.addedAt,
            importState: parseImportStatus(convexPaper.importStatus),
          }
        : null,
    [convexPaper],
  );

  const deletePaper = useDeletePaper();
  const retryImport = useRetryImport();

  const handleRetry = useCallback(async () => {
    try {
      await retryImport(id);
      toast.success("Retrying import");
    } catch {
      toast.error("Failed to retry import");
    }
  }, [retryImport, id]);

  const handleDeletePaper = useCallback(() => {
    if (deletePaperTimerRef.current) clearTimeout(deletePaperTimerRef.current);

    const timer = setTimeout(async () => {
      deletePaperTimerRef.current = null;
      try {
        await deletePaper(id);
        toast.success("Paper removed");
        router.push("/");
      } catch {
        toast.error("Failed to delete paper");
      }
    }, 5000);

    deletePaperTimerRef.current = timer;

    toast("Paper will be deleted.", {
      action: {
        label: "Undo",
        onClick: () => {
          if (deletePaperTimerRef.current) {
            clearTimeout(deletePaperTimerRef.current);
            deletePaperTimerRef.current = null;
          }
          toast.success("Paper deletion cancelled");
        },
      },
      duration: 5000,
    });
  }, [deletePaper, id, router]);

  // --- URL-derived state ---
  const viewParam = searchParams.get("view");
  const view = viewParam === "pdf" ? "pdf" : viewParam === "split" ? "split" : "summary";
  const chatOpen = searchParams.has("chat");

  // --- URL helpers ---
  const updateUrl = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      // Clean legacy params
      next.delete("panel");
      next.delete("tab");
      next.delete("note");

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Redirect if paper not found
  useEffect(() => {
    if (!loading && !paper) {
      router.push("/");
    }
  }, [loading, paper, router]);

  // --- Callbacks ---
  const handleToggleChat = useCallback(() => {
    updateUrl({ chat: chatOpen ? null : "1" });
  }, [chatOpen, updateUrl]);

  const handleCloseChat = useCallback(() => {
    updateUrl({ chat: null });
  }, [updateUrl]);

  const handleCitationNavigate = useCallback(
    (href: string) => {
      const url = new URL(href, window.location.origin);
      updateUrl({
        view: view === "split" ? "split" : "pdf",
        page: url.searchParams.get("page"),
        cite: url.searchParams.get("cite"),
        annotation: url.searchParams.get("annotation"),
      });
    },
    [updateUrl, view],
  );

  const handleReturnToChat = useCallback(
    (refId: string) => {
      // Clear citation focus from PDF, ensure chat is open, and scroll chat to the message
      updateUrl({ cite: null, page: null, chat: "1" });
      // Use a unique key each time so the effect re-fires even for the same refId
      setScrollToRefId(`${refId}::${Date.now()}`);
    },
    [updateUrl],
  );

  // Extract the actual refId from the scroll-to key (strip the timestamp suffix)
  const scrollToRefIdClean = scrollToRefId?.split("::")[0];

  const handleAskAI = useCallback(
    (selectedText: string) => {
      const prefill = `What does this mean?\n\n> ${selectedText}`;
      setAskAIText(prefill);
      updateUrl({ chat: "1" });
    },
    [updateUrl],
  );

  // Cancel paper delete timer on unmount
  useEffect(() => {
    return () => {
      if (deletePaperTimerRef.current) {
        clearTimeout(deletePaperTimerRef.current);
      }
    };
  }, []);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleToggleChat();
        return;
      }
      if (e.key === "Escape") {
        if (chatOpen) {
          e.preventDefault();
          handleCloseChat();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    chatOpen,
    handleCloseChat,
    handleToggleChat,
  ]);

  // --- Loading state ---
  if (loading || isDesktop === null) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <Header fullWidth breadcrumbs={[{ label: "Papers", href: "/paper" }, { label: "..." }]}>
          <Skeleton className="h-8 w-28" />
        </Header>
        <div className="flex-1 animate-pulse bg-muted/10" />
      </div>
    );
  }

  if (!paper) return null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Toaster
        richColors
        position="bottom-right"
        toastOptions={{
          className: "!rounded-xl !border-border/60 !bg-card/95 !backdrop-blur-xl",
        }}
      />
      <Header
        fullWidth
        breadcrumbs={[
          { label: "Papers", href: "/paper" },
          { label: paper.title, href: `/paper/${id}` },
        ]}
      >
        <div className="flex items-center gap-1">
          {isWide && paper.importState.phase === "completed" && (
            <>
              <Button
                variant={view === "summary" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => updateUrl({ view: null })}
              >
                Summary
              </Button>
              <Button
                variant={view === "pdf" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => updateUrl({ view: "pdf" })}
              >
                PDF
              </Button>
              <Button
                variant={view === "split" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => updateUrl({ view: "split" })}
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
                Split
              </Button>
              <div className="mx-1 h-4 w-px bg-border/50" />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href).then(
                () => toast.success("Link copied to clipboard!"),
                () => toast.error("Failed to copy link"),
              );
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
        </div>
      </Header>

      {/* Import status banner */}
      {paper.importState.phase === "importing" && (
        <div className="flex items-center gap-2 bg-secondary/40 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="font-mono text-xs">{stageLabel(paper.importState.stage)}</span>
        </div>
      )}
      {paper.importState.phase === "failed" && (
        <div className="flex items-center gap-3 bg-destructive/5 px-4 py-2 text-sm backdrop-blur-sm">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-destructive">
            {paper.importState.error}
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-lg text-xs" onClick={handleRetry}>
            <RotateCcw className="h-3 w-3" />
            Retry
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-lg text-xs text-destructive" onClick={handleDeletePaper}>
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      )}

      {/* Main content */}
      <main className="min-h-0 flex-1 overflow-hidden bg-muted/5">
        {view === "split" && isWide ? (
          <div className="flex h-full">
            <div className="flex-1 min-w-0 overflow-hidden border-r border-border/30">
              <SummaryView
                paper={paper}
                onViewPdf={() => updateUrl({ view: "pdf" })}
                onNavigate={handleCitationNavigate}
                scrollTopRef={summaryScrollRef}
              />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden" style={{ minWidth: 500 }}>
              <LazyPdfViewer
                paperId={id}
                onToggleChat={handleToggleChat}
                chatOpen={chatOpen}
                onReturnToChat={handleReturnToChat}
                onAskAI={handleAskAI}
              />
            </div>
          </div>
        ) : view === "pdf" ? (
          <LazyPdfViewer
            paperId={id}
            onToggleChat={isDesktop ? handleToggleChat : undefined}
            chatOpen={chatOpen}
            onReturnToChat={handleReturnToChat}
            onAskAI={handleAskAI}
          />
        ) : (
          <SummaryView
            paper={paper}
            onViewPdf={() => updateUrl({ view: "pdf" })}
            onNavigate={handleCitationNavigate}
            scrollTopRef={summaryScrollRef}
          />
        )}
      </main>

      {/* Desktop: Chat sheet */}
      {isDesktop && paper && (
        <PaperChatDrawer
          paperId={id}
          paper={paper}
          open={chatOpen}
          onOpenChange={(open) => {
            if (!open) handleCloseChat();
          }}
          onCitationNavigate={handleCitationNavigate}
          mode="sheet"
          scrollToRefId={scrollToRefIdClean}
          initialMessage={askAIText}
          onInitialMessageConsumed={() => setAskAIText(undefined)}
        />
      )}

      {/* Mobile: Chat bottom sheet */}
      {!isDesktop && (
        <>
          <div className="pointer-events-none fixed inset-x-0 bottom-14 z-30 px-4 pb-2 sm:hidden">
            <div className="pointer-events-auto mx-auto flex max-w-sm items-center justify-center rounded-2xl border border-border/40 bg-background/80 p-1.5 shadow-lg backdrop-blur-xl">
              <Button
                variant={mobilePanel === "chat" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 gap-1.5 rounded-xl"
                onClick={() => setMobilePanel(mobilePanel === "chat" ? null : "chat")}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Chat
              </Button>
            </div>
          </div>

          <Sheet open={mobilePanel === "chat"} onOpenChange={(open) => !open && setMobilePanel(null)}>
            <SheetContent
              side="bottom"
              className="h-[78vh] rounded-t-2xl border-border/40 bg-background p-0 sm:hidden"
              showCloseButton={false}
            >
              <SheetHeader className="sr-only">
                <SheetTitle className="text-base font-semibold tracking-tight">
                  Chat
                </SheetTitle>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col">
                {paper && (
                  <PaperChatDrawer
                    paperId={id}
                    paper={paper}
                    onCitationNavigate={handleCitationNavigate}
                    mode="inline"
                    className="min-h-0 flex-1"
                    scrollToRefId={scrollToRefIdClean}
                    initialMessage={askAIText}
                    onInitialMessageConsumed={() => setAskAIText(undefined)}
                  />
                )}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
