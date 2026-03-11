"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import { MessageCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import type { ThreadListItem } from "@/types";

interface ThreadsSidebarProps {
  paperId: string;
  selectedThread?: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onThreadsLoaded?: (threads: ThreadListItem[]) => void;
  invalidateKey?: number;
}

export function ThreadsSidebar({
  paperId,
  selectedThread,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onThreadsLoaded,
  invalidateKey,
}: ThreadsSidebarProps) {
  const {
    data: fetchedThreads,
    loading,
    refetch,
  } = useCachedFetch<ThreadListItem[]>(`/api/papers/${paperId}/threads`, {
    cacheKey: `paper:threads:${paperId}`,
    invalidateKey,
  });

  const threads = fetchedThreads ?? [];
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (fetchedThreads) {
      onThreadsLoaded?.(fetchedThreads);
    }
  }, [fetchedThreads]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
        <h3 className="text-sm font-semibold">Threads</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={refetch}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onNewThread}
          >
            <Plus className="h-3 w-3" />
            New Thread
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                No threads yet
              </p>
              <p className="text-xs text-muted-foreground/60">
                Start a conversation about this paper
              </p>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2">
            {threads.map((thread, i) => (
              <div key={thread.id}>
                <div className="group relative">
                  <button
                    onClick={() => onSelectThread(thread.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      selectedThread === thread.id
                        ? "bg-primary/10 ring-1 ring-primary/20 text-foreground"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <MessageCircle
                      className={`h-4 w-4 shrink-0 ${
                        selectedThread === thread.id
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    />
                    <div className="w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {thread.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                        <span>
                          {thread.messageCount} message
                          {thread.messageCount !== 1 ? "s" : ""}
                        </span>
                        <span>·</span>
                        <span>
                          {new Date(thread.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {thread.preview && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/80 italic">
                          {thread.preview}
                        </p>
                      )}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 md:hidden md:group-hover:flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(thread.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                {i < threads.length - 1 && <Separator className="my-0.5" />}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete thread</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation thread. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDeleteThread(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
