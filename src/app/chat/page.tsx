"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Header } from "@/components/header";
import { ThreadList } from "@/components/thread-list";
import { PaperPickerDialog } from "@/components/paper-picker-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useState } from "react";
import type { ChatThreadListItem } from "@/types";

export default function ChatInboxPage() {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  const convexThreads = useQuery(api.threads.list);
  const removeThread = useMutation(api.threads.remove);
  const loading = convexThreads === undefined;

  const threads: ChatThreadListItem[] = (convexThreads ?? []).map((t) => ({
    id: t._id,
    title: t.title,
    updatedAt: t.updatedAt,
    messageCount: t.messageCount,
    preview: t.preview,
    paperIds: t.paperIds,
    paperTitles: t.paperTitles,
  }));

  function handleNewChat(paperIds: string[]) {
    router.push(`/chat/new?paperIds=${paperIds.join(",")}`);
  }

  async function handleDelete(threadId: string) {
    try {
      await removeThread({ id: threadId as any });
      toast.success("Chat deleted");
    } catch {
      toast.error("Failed to delete chat");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="bottom-right" />
      <Header pageTitle="Chats">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </Header>
      <main className="mx-auto max-w-2xl px-4 py-8 pb-20 sm:px-6 sm:pb-8">
        <ThreadList
          threads={threads}
          loading={loading}
          onSelect={(id) => router.push(`/chat/${id}`)}
          onDelete={handleDelete}
        />
      </main>
      <PaperPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multi
        onSelect={handleNewChat}
      />
    </div>
  );
}
