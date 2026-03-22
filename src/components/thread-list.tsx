"use client";

import { useState } from "react";
import { MessageCircle, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ChatThreadListItem } from "@/types";
import { timeAgo } from "@/lib/time";

interface ThreadListProps {
  threads: ChatThreadListItem[];
  loading: boolean;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}

export function ThreadList({ threads, loading, onSelect, onDelete }: ThreadListProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border/20 p-4 space-y-2">
            <div className="h-4 w-3/4 animate-shimmer rounded-lg" />
            <div className="h-3 w-1/2 animate-shimmer rounded-lg" />
            <div className="h-3 w-1/3 animate-shimmer rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <MessageCircle className="h-6 w-6 text-primary/50" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">No chats yet</p>
          <p className="text-sm text-muted-foreground">
            Start a new chat to discuss your papers
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {threads.map((thread) => (
          <div key={thread.id} className="group relative">
            <Button
              variant="ghost"
              onClick={() => onSelect(thread.id)}
              className="flex h-auto w-full flex-col items-start gap-1.5 rounded-xl border border-border/40 bg-card/60 px-4 py-3.5 text-left font-normal text-foreground transition-all duration-200 hover:border-primary/20 hover:bg-card hover:text-foreground hover:shadow-md hover:shadow-primary/5"
            >
              <p className="text-sm font-medium leading-tight pr-8 transition-colors duration-300 group-hover:text-primary">{thread.title}</p>
              {thread.paperTitles.length > 0 && (
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground/60">
                  {thread.paperTitles.map((title, i) => (
                    <span key={i} className={`inline-flex min-w-0 items-center gap-1 ${thread.paperTitles.length > 1 ? "max-w-[45%]" : "max-w-full"}`}>
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{title}</span>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/40">
                {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""} · {timeAgo(thread.updatedAt)}
              </p>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3 h-7 w-7 rounded-lg opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(thread.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
