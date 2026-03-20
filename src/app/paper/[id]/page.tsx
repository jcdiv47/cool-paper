"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
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

function PdfSkeleton() {
  return <div className="flex h-full items-center justify-center bg-muted/20 animate-pulse" />;
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
  // Mobile panel state — used for the bottom sheet approach on mobile
  const [mobilePanel, setMobilePanel] = useState<"chat" | null>(null);

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

  const handleDeletePaper = useCallback(async () => {
    try {
      await deletePaper(id);
      toast.success("Paper removal queued");
      router.push("/");
    } catch {
      toast.error("Failed to delete paper");
    }
  }, [deletePaper, id, router]);

  // --- URL-derived state ---
  const view = searchParams.get("view") === "pdf" ? "pdf" : "summary";
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
        view: "pdf",
        page: url.searchParams.get("page"),
        cite: url.searchParams.get("cite"),
        annotation: url.searchParams.get("annotation"),
      });
    },
    [updateUrl],
  );

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
        <div className="flex-1 animate-pulse bg-muted/20" />
      </div>
    );
  }

  if (!paper) return null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Toaster richColors position="bottom-right" />
      <Header
        fullWidth
        breadcrumbs={[
          { label: "Papers", href: "/paper" },
          { label: paper.title },
        ]}
      />

      {/* Import status banner */}
      {paper.importState.phase === "importing" && (
        <div className="flex items-center gap-2 bg-secondary/50 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="font-mono text-xs">{stageLabel(paper.importState.stage)}</span>
        </div>
      )}
      {paper.importState.phase === "failed" && (
        <div className="flex items-center gap-3 bg-destructive/5 px-4 py-2 text-sm">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-destructive">
            {paper.importState.error}
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleRetry}>
            <RotateCcw className="h-3 w-3" />
            Retry
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={handleDeletePaper}>
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      )}

      {/* Main content */}
      <main className="min-h-0 flex-1 overflow-hidden bg-muted/10">
        {view === "pdf" ? (
          <LazyPdfViewer
            paperId={id}
            onToggleChat={isDesktop ? handleToggleChat : undefined}
            onViewSummary={() => updateUrl({ view: null })}
            chatOpen={chatOpen}
          />
        ) : (
          <SummaryView
            paper={paper}
            onViewPdf={() => updateUrl({ view: "pdf" })}
            onNavigate={handleCitationNavigate}
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
        />
      )}

      {/* Mobile: Chat bottom sheet */}
      {!isDesktop && (
        <>
          <div className="pointer-events-none fixed inset-x-0 bottom-14 z-30 px-4 pb-2 sm:hidden">
            <div className="pointer-events-auto mx-auto flex max-w-sm items-center justify-center rounded-2xl border border-border/60 bg-background/92 p-1.5 shadow-lg backdrop-blur">
              <Button
                variant={mobilePanel === "chat" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 gap-1.5"
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
              className="h-[78vh] rounded-t-3xl border-border/60 bg-background p-0 sm:hidden"
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
