import { Home, BookOpen, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** true = exact match only (for "/") */
  exact?: boolean;
}

/** Desktop top-nav (logo already acts as Home) */
export const DESKTOP_NAV: NavItem[] = [
  { href: "/paper", label: "Papers", icon: BookOpen },
  { href: "/chat", label: "Chats", icon: MessageCircle },
];

/** Mobile bottom tab bar (Home is explicit) */
export const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/paper", label: "Papers", icon: BookOpen },
  { href: "/chat", label: "Chats", icon: MessageCircle },
];
