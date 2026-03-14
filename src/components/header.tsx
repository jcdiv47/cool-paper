"use client";

import { FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export function Header({
  children,
  fullWidth,
  search,
  onSearchChange,
  searchPlaceholder = "Search papers...",
}: {
  children?: React.ReactNode;
  fullWidth?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div
        className={`flex h-14 items-center gap-4 px-4 sm:px-6 ${fullWidth ? "" : "mx-auto max-w-7xl"}`}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground">
            <FileText className="h-3.5 w-3.5 text-background" />
          </div>
          <span className="font-serif text-[15px] font-medium tracking-tight">
            Cool Paper
          </span>
        </Link>
        {onSearchChange !== undefined && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <Input
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-9 text-sm"
            />
          </div>
        )}
        <div className="flex flex-1 items-center justify-end gap-2">
          {children}
        </div>
      </div>
    </header>
  );
}
