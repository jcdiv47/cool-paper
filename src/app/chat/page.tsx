"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ThreadList } from "@/components/thread-list";
import { PaperPickerDialog } from "@/components/paper-picker-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Toaster, toast } from "sonner";
import type { ChatThreadListItem } from "@/types";

export default function ChatInboxPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/threads");
      const data = await res.json();
      setThreads(data);
    } catch {
      toast.error("Failed to load chats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  function handleNewChat(paperIds: string[]) {
    router.push(`/chat/new?paperIds=${paperIds.join(",")}`);
  }

  async function handleDelete(threadId: string) {
    try {
      await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      toast.success("Chat deleted");
    } catch {
      toast.error("Failed to delete chat");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="bottom-right" />
      <Header>
        <span className="text-sm font-medium">Chats</span>
        <div className="flex-1" />
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </Header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
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
