"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/header";
import { PaperPickerDialog } from "@/components/paper-picker-dialog";
import { useConvexChat } from "@/hooks/use-convex-chat";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "sonner";
import { parseImportStatus } from "@/lib/import-status";
import type { PaperMetadata } from "@/types";

function ChatSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-8 sm:px-8">
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted/30" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted/30" />
    </div>
  );
}

const LazyChatView = dynamic(
  () => import("@/components/chat-view").then((m) => ({ default: m.ChatView })),
  { ssr: false, loading: () => <ChatSkeleton /> }
);

export default function ActiveChatPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const chat = useConvexChat();
  const [loading, setLoading] = useState(threadId !== "new");
  const [pickerOpen, setPickerOpen] = useState(false);

  const isNew = threadId === "new";

  // Resolve paper metadata from Convex
  const convexPapers = useQuery(api.papers.list);
  const papers: PaperMetadata[] = (convexPapers ?? [])
    .filter((p) => chat.paperIds.includes(p.sanitizedId))
    .map((p) => ({
      arxivId: p.arxivId,
      title: p.title,
      authors: p.authors,
      abstract: p.abstract,
      summary: p.summary,
      published: p.published,
      categories: p.categories,
      addedAt: p.addedAt,
      importState: parseImportStatus(p.importStatus),
    }));

  // For new chats: read paperIds from query params
  useEffect(() => {
    if (!isNew) return;
    const raw = searchParams.get("paperIds");
    if (raw) {
      chat.setPaperIds(raw.split(",").filter(Boolean));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, searchParams]);

  // For existing chats: load thread
  useEffect(() => {
    if (isNew) return;
    async function load() {
      try {
        await chat.loadThread(threadId);
      } catch {
        toast.error("Failed to load chat");
        router.push("/chat");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, isNew]);

  // Replace URL once a new thread gets its real ID.
  // Wait until streaming finishes so the component doesn't re-mount and lose
  // the streaming subscription (which would leave the UI blank until the full
  // response is persisted).
  useEffect(() => {
    if (isNew && chat.threadId && !chat.isStreaming) {
      router.replace(`/chat/${chat.threadId}`);
    }
  }, [isNew, chat.threadId, chat.isStreaming, router]);

  async function handleAddPaper(paperIds: string[]) {
    for (const pid of paperIds) {
      await chat.addPaper(pid);
    }
  }

  function handleRemovePaper(paperId: string) {
    chat.removePaper(paperId).catch(() => {
      toast.error("Failed to remove paper");
    });
  }

  // Derive thread title from chat state
  const threadTitle = chat.messages.length > 0
    ? chat.messages[0]?.content?.slice(0, 40) || "New Chat"
    : "New Chat";

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <Header fullWidth breadcrumbs={[{ label: "Chats", href: "/chat" }, { label: "..." }]}>
          <Skeleton className="h-5 w-48" />
        </Header>
        <div className="flex-1 animate-pulse bg-muted/20" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <Toaster richColors position="bottom-right" />
      <Header
        fullWidth
        breadcrumbs={[
          { label: "Chats", href: "/chat" },
          { label: threadTitle },
        ]}
      />
      <div className="min-h-0 flex-1">
        <LazyChatView
          messages={chat.messages}
          streamingMessage={chat.streamingMessage}
          isStreaming={chat.isStreaming}
          isThinking={chat.isThinking}
          error={chat.error}
          onSendMessage={chat.sendMessage}
          onCancel={chat.cancelStream}
          model={chat.model}
          onModelChange={chat.setModel}
          papers={papers}
          onRemovePaper={handleRemovePaper}
          onAddPaperClick={() => setPickerOpen(true)}
        />
      </div>
      <PaperPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeIds={chat.paperIds}
        onSelect={handleAddPaper}
      />
    </div>
  );
}
