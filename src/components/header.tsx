"use client";

import { FileText } from "lucide-react";
import Link from "next/link";

export function Header({
  children,
  fullWidth,
}: {
  children?: React.ReactNode;
  fullWidth?: boolean;
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
        <div className="flex flex-1 items-center gap-2">
          {children}
        </div>
      </div>
    </header>
  );
}
