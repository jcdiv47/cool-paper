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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

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
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/20" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center bg-secondary">
          <MessageCircle className="h-6 w-6 text-primary" />
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
              className="flex h-auto w-full flex-col items-start gap-1.5 rounded-xl border border-border bg-card px-4 py-3.5 text-left font-normal text-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground"
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
              className="absolute right-2 top-3 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
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
