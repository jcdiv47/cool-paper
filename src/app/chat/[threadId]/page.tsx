"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/header";
import { PaperPickerDialog } from "@/components/paper-picker-dialog";
import { useChat } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "sonner";
import type { PaperMetadata } from "@/types";

function ChatSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-8 sm:px-8">
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
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
  const chat = useChat();
  const [papers, setPapers] = useState<PaperMetadata[]>([]);
  const [loading, setLoading] = useState(threadId !== "new");
  const [pickerOpen, setPickerOpen] = useState(false);

  const isNew = threadId === "new";

  // For new chats: read paperIds from query params
  useEffect(() => {
    if (!isNew) return;
    const raw = searchParams.get("paperIds");
    if (raw) {
      chat.setPaperIds(raw.split(",").filter(Boolean));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, searchParams]);

  // For existing chats: load thread from API
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

  // Replace URL once a new thread gets its real ID
  useEffect(() => {
    if (isNew && chat.threadId) {
      router.replace(`/chat/${chat.threadId}`);
    }
  }, [isNew, chat.threadId, router]);

  // Fetch paper metadata when paperIds change
  useEffect(() => {
    if (chat.paperIds.length === 0) return;
    async function fetchPapers() {
      const fetched: PaperMetadata[] = [];
      for (const pid of chat.paperIds) {
        try {
          const res = await fetch(`/api/papers/${pid}`);
          if (res.ok) {
            fetched.push(await res.json());
          }
        } catch {
          // skip missing papers
        }
      }
      setPapers(fetched);
    }
    fetchPapers();
  }, [chat.paperIds]);

  async function handleAddPaper(paperIds: string[]) {
    for (const pid of paperIds) {
      await chat.addPaper(pid);
    }
  }

  function handleRemovePaper(paperId: string) {
    chat.removePaper(paperId);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header fullWidth>
          <Skeleton className="h-5 w-48" />
        </Header>
        <div className="flex-1 animate-pulse bg-muted/20" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Toaster richColors position="bottom-right" />
      <Header fullWidth>
        <Button
          variant="link"
          size="sm"
          onClick={() => router.push("/chat")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Chats
        </Button>
        <div className="flex-1" />
      </Header>
      <div className="min-h-0 flex-1">
        <LazyChatView
          messages={chat.messages}
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
