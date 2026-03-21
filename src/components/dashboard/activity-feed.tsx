"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, MessageCircle, Highlighter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/time";

interface ActivityItem {
  type: "paper_added" | "thread_created" | "annotation_created";
  timestamp: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  /** Number of items to show before collapsing. Defaults to 5. */
  initialLimit?: number;
}

const typeConfig = {
  paper_added: {
    icon: FileText,
    label: "Added",
    color: "text-primary/70",
    bg: "bg-primary/10",
  },
  thread_created: {
    icon: MessageCircle,
    label: "Chat",
    color: "text-chart-2",
    bg: "bg-emerald-500/10",
  },
  annotation_created: {
    icon: Highlighter,
    label: "Note",
    color: "text-chart-3",
    bg: "bg-purple-500/10",
  },
} as const;

export function ActivityFeed({ activities, initialLimit = 5 }: ActivityFeedProps) {
  const [expanded, setExpanded] = useState(false);

  if (activities.length === 0) return null;

  const visibleActivities = expanded ? activities : activities.slice(0, initialLimit);
  const hasMore = activities.length > initialLimit;

  return (
    <section>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Recent Activity
      </h2>
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm divide-y divide-border/20">
        {visibleActivities.map((activity, i) => {
          const config = typeConfig[activity.type];
          const Icon = config.icon;

          return (
            <Link
              key={`${activity.type}-${activity.timestamp}-${i}`}
              href={activity.href}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 first:rounded-t-xl last:rounded-b-xl"
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.bg}`}
              >
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground/90">
                  {activity.title}
                </p>
                {activity.subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground/40">
                    {activity.subtitle}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground/40">
                {timeAgo(activity.timestamp)}
              </span>
            </Link>
          );
        })}

        {hasMore && !expanded && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-muted-foreground/60 hover:text-primary"
              onClick={() => setExpanded(true)}
            >
              View all {activities.length} activities
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
