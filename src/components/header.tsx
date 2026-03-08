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
    <header className="sticky top-0 z-50">
      <div className="h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/60 to-amber-500/0" />
      <div className="bg-background/80 backdrop-blur-2xl backdrop-saturate-150">
        <div
          className={`flex h-14 items-center gap-4 px-4 sm:px-6 ${fullWidth ? "" : "mx-auto max-w-7xl"}`}
        >
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-b from-amber-600 to-amber-800 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] transition-transform duration-150 group-hover:scale-105">
              <FileText className="h-4 w-4 text-amber-100" />
            </div>
            <span className="font-serif text-base font-medium italic tracking-tight">
              Cool Paper
            </span>
          </Link>
          <div className="flex flex-1 items-center gap-2">
            {children}
          </div>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </header>
  );
}
