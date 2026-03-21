"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV } from "@/lib/nav";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border/40 bg-background/80 pb-1 backdrop-blur-2xl backdrop-saturate-150 sm:hidden">
      {MOBILE_NAV.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 px-4 py-1.5 transition-all duration-200 ${
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-200 ${
              isActive ? "bg-primary/15" : ""
            }`}>
              <item.icon className={`h-[18px] w-[18px] transition-transform duration-200 ${isActive ? "scale-105" : ""}`} />
            </div>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
