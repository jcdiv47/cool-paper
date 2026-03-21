"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { useConvexChat } from "@/hooks/use-convex-chat";
import { ChatView } from "@/components/chat-view";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import type { PaperMetadata } from "@/types";
import { cn } from "@/lib/utils";

interface PaperChatDrawerProps {
  paperId: string;
  paper: PaperMetadata;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCitationNavigate: (href: string) => void;
  mode?: "sheet" | "inline";
  className?: string;
  /** When set, scroll chat to the message containing this refId. */
  scrollToRefId?: string;
}

export function PaperChatDrawer({
  paperId,
  paper,
  open,
  onOpenChange,
  onCitationNavigate,
  mode = "sheet",
  className,
  scrollToRefId,
}: PaperChatDrawerProps) {
  const chat = useConvexChat();
  const existingThread = useQuery(api.threads.getByPaperId, { paperId });
  const initializedRef = useRef(false);
  const searchParams = useSearchParams();
  const activeCiteRefId = searchParams.get("cite") ?? undefined;

  // On mount / when existingThread resolves, load or prepare the thread
  useEffect(() => {
    if (initializedRef.current) return;
    if (existingThread === undefined) return; // still loading

    initializedRef.current = true;
    if (existingThread) {
      chat.loadThread(existingThread._id).catch((err) => {
        console.error("Failed to load thread:", err);
      });
    } else {
      chat.setPaperIds([paperId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingThread, paperId]);

  const papers: PaperMetadata[] = [paper];

  const chatView = (
    <ChatView
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
      onNavigate={onCitationNavigate}
      hidePaperCards
      activeCiteRefId={activeCiteRefId}
      scrollToRefId={scrollToRefId}
    />
  );

  if (mode === "inline") {
    return <div className={cn("flex h-full flex-col", className)}>{chatView}</div>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[450px] sm:max-w-[450px] p-0"
        showCloseButton={false}
      >
        <VisuallyHidden.Root>
          <SheetTitle>Chat about paper</SheetTitle>
        </VisuallyHidden.Root>
        {chatView}
      </SheetContent>
    </Sheet>
  );
}
