"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
  FileText,
  Home,
  MessageCircle,
  Plus,
  Search,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { api } from "../../convex/_generated/api";
import { buildPaperWorkspaceHref } from "@/lib/paper-workspace";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportPaper?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onImportPaper,
}: CommandPaletteProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"commands" | "search">("commands");
  const [searchQuery, setSearchQuery] = useState("");

  const papers = useQuery(api.papers.list);

  // Full-text search across all paper chunks (C4)
  const searchResults = useQuery(
    api.paperChunks.searchGlobal,
    mode === "search" && searchQuery.length >= 2
      ? { query: searchQuery, limit: 15 }
      : "skip",
  );

  // Reset mode when dialog closes
  useEffect(() => {
    if (!open) {
      setMode("commands");
      setSearchQuery("");
    }
  }, [open]);

  function handleClose() {
    onOpenChange(false);
  }

  function handleNavigate(path: string) {
    router.push(path);
    handleClose();
  }

  function handlePaperSelect(sanitizedId: string) {
    handleNavigate(`/paper/${sanitizedId}`);
  }

  function handleSearchResultSelect(
    sanitizedId: string,
    page?: number
  ) {
    const href = buildPaperWorkspaceHref(sanitizedId, {
      view: "pdf",
      page: page ?? 1,
    });
    router.push(href);
    handleClose();
  }

  function switchToSearch() {
    setMode("search");
    setSearchQuery("");
  }

  function switchToCommands() {
    setMode("commands");
    setSearchQuery("");
  }

  if (mode === "search") {
    const isSearching =
      searchQuery.length >= 2 && searchResults === undefined;

    return (
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Search Paper Content"
        description="Full-text search across all paper content"
        showCloseButton={false}
      >
        <CommandInput
          placeholder="Search across all paper content..."
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandGroup>
            <CommandItem onSelect={switchToCommands}>
              <ArrowLeft />
              <span>Back to commands</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          {searchQuery.length < 2 ? (
            <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
          ) : isSearching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : searchResults && searchResults.length === 0 ? (
            <CommandEmpty>No matching content found.</CommandEmpty>
          ) : searchResults ? (
            <CommandGroup heading="Results">
              {searchResults.map((result, i) => {
                const snippet =
                  result.text.length > 100
                    ? result.text.slice(0, 100) + "..."
                    : result.text;
                return (
                  <CommandItem
                    key={`${result.sanitizedId}-${result.refId}-${i}`}
                    value={`${result.paperTitle} ${result.text}`}
                    onSelect={() =>
                      handleSearchResultSelect(result.sanitizedId, result.page)
                    }
                  >
                    <FileText />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight line-clamp-1">
                        {result.paperTitle}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/60 line-clamp-1">
                        p.{result.page}
                        {result.section ? ` · ${result.section}` : ""} ·{" "}
                        {snippet}
                      </p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    );
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search for a command to run..."
      showCloseButton={false}
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {papers === undefined ? (
          <CommandGroup heading="Papers">
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          </CommandGroup>
        ) : papers.length > 0 ? (
          <CommandGroup heading="Papers">
            {papers.map((paper) => {
              const sanitizedId = paper.arxivId.replace(/\//g, "_");
              return (
                <CommandItem
                  key={paper.arxivId}
                  value={`${paper.title} ${paper.arxivId}`}
                  onSelect={() => handlePaperSelect(sanitizedId)}
                >
                  <FileText />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight line-clamp-1">
                      {paper.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground/60 truncate">
                      {paper.arxivId}
                    </p>
                  </div>
                  <ArrowRight className="ml-auto opacity-40" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem
            value="Dashboard Home"
            onSelect={() => handleNavigate("/")}
          >
            <Home />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem
            value="Papers Library"
            onSelect={() => handleNavigate("/paper")}
          >
            <BookOpen />
            <span>Papers</span>
          </CommandItem>
          <CommandItem
            value="Chats Conversations"
            onSelect={() => handleNavigate("/chat")}
          >
            <MessageCircle />
            <span>Chats</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            value="Import Paper Add"
            onSelect={() => {
              handleClose();
              onImportPaper?.();
            }}
          >
            <Plus />
            <span>Import Paper</span>
          </CommandItem>
          <CommandItem
            value="New Chat Conversation"
            onSelect={() => handleNavigate("/chat")}
          >
            <MessageCircle />
            <span>New Chat</span>
          </CommandItem>
          <CommandItem
            value="Search Paper Content"
            onSelect={switchToSearch}
          >
            <Search />
            <span>Search Paper Content...</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
