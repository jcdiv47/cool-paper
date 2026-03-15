"use client";

import { FileText, Search, BookOpen, NotebookPen, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/paper", label: "Papers", icon: BookOpen },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/chat", label: "Chats", icon: MessageCircle },
];

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
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-2xl">
      <div
        className={`flex h-14 items-center gap-4 px-4 sm:px-6 ${fullWidth ? "" : "mx-auto max-w-7xl"}`}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <FileText className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-serif text-[15px] font-semibold tracking-tight">
            Cool Paper
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 sm:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

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
      {/* Gradient border */}
      <div className="h-px bg-border" />
    </header>
  );
}
