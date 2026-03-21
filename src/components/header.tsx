"use client";

import { Search, ChevronRight, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DESKTOP_NAV } from "@/lib/nav";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export function Header({
  children,
  fullWidth,
  search,
  onSearchChange,
  searchPlaceholder = "Search papers...",
  pageTitle,
  breadcrumbs,
  secondaryToolbar,
}: {
  children?: React.ReactNode;
  fullWidth?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  pageTitle?: string;
  breadcrumbs?: Breadcrumb[];
  secondaryToolbar?: React.ReactNode;
}) {
  const pathname = usePathname();

  // Find the first breadcrumb with an href (used as back target on mobile)
  const backCrumb = breadcrumbs?.find((b) => b.href);

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-2xl backdrop-saturate-150">
      <div
        className={`flex h-14 items-center gap-4 px-4 sm:px-6 ${fullWidth ? "" : "mx-auto max-w-7xl"}`}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
            <span className="text-sm font-bold text-primary">C</span>
          </div>
          <span className="font-serif text-[15px] font-semibold tracking-tight">
            Cool Paper
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {DESKTOP_NAV.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Page title (list pages) */}
        {pageTitle && (
          <span className="text-sm font-medium sm:hidden">{pageTitle}</span>
        )}

        {/* Breadcrumbs — desktop: full trail, mobile: back arrow + parent */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <>
            {/* Mobile: back arrow + parent name */}
            {backCrumb && (
              <Link
                href={backCrumb.href!}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:hidden"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {backCrumb.label}
              </Link>
            )}
            {/* Desktop: full breadcrumb trail */}
            <div className="hidden items-center gap-1 text-xs sm:flex">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                  )}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="max-w-[30vw] truncate text-muted-foreground/60">
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </>
        )}

        {onSearchChange !== undefined && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 rounded-full pl-9 text-sm"
            />
          </div>
        )}
        <div className="flex flex-1 items-center justify-end gap-2">
          {children}
        </div>
      </div>
      {/* Secondary toolbar (mobile only) */}
      {secondaryToolbar && (
        <div className="flex h-10 items-center gap-2 px-4 sm:px-6 md:hidden">
          {secondaryToolbar}
        </div>
      )}
    </header>
  );
}
