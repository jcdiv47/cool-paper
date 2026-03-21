"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MessageCircle, FileText, Highlighter, Quote } from "lucide-react";

interface SpotlightPaper {
  sanitizedId: string;
  title: string;
  authors: string[];
  summary?: string;
  categories: string[];
  published: string;
  threadCount: number;
  messageCount: number;
  annotationCount: number;
  citationCount: number;
}

interface SpotlightPaperCardProps {
  paper: SpotlightPaper;
  index: number;
}

const engagementItems = [
  { key: "threadCount" as const, icon: MessageCircle, label: "chats" },
  { key: "messageCount" as const, icon: FileText, label: "messages" },
  { key: "annotationCount" as const, icon: Highlighter, label: "notes" },
  { key: "citationCount" as const, icon: Quote, label: "citations" },
];

export function SpotlightPaperCard({ paper, index }: SpotlightPaperCardProps) {
  const firstSentence = paper.summary
    ? paper.summary.split(/(?<=[.!?])\s+/)[0]?.slice(0, 150) ?? ""
    : paper.categories.join(", ");

  const truncatedAuthors =
    paper.authors.length > 3
      ? paper.authors.slice(0, 3).join(", ") + ` +${paper.authors.length - 3}`
      : paper.authors.join(", ");

  return (
    <Link
      href={`/paper/${paper.sanitizedId}`}
      className="animate-card-enter snap-start shrink-0 block"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <Card className="group h-full min-w-[300px] max-w-[380px] border-border/40 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:border-primary/25 hover:bg-card hover:shadow-lg hover:shadow-primary/5 border-l-2 border-l-primary/30">
        <div className="space-y-3 px-5 py-5">
          {/* Category + date */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-primary">
              {paper.categories[0]}
            </span>
            <span className="text-border">·</span>
            <time>
              {new Date(paper.published).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
              })}
            </time>
          </div>

          {/* Title */}
          <h3 className="font-serif text-base font-semibold leading-snug tracking-tight line-clamp-2 group-hover:text-primary transition-colors duration-300">
            {paper.title}
          </h3>

          {/* Authors */}
          <p className="text-[12px] text-muted-foreground/50">
            {truncatedAuthors}
          </p>

          {/* Summary excerpt */}
          {firstSentence && (
            <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/40 italic">
              {firstSentence}
            </p>
          )}

          {/* Engagement stats */}
          <div className="flex items-center gap-3 pt-1 border-t border-border/20">
            {engagementItems.map(({ key, icon: Icon, label }) => {
              const val = paper[key];
              if (val === 0) return null;
              return (
                <div
                  key={key}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/50"
                  title={`${val} ${label}`}
                >
                  <Icon className="h-2.5 w-2.5" />
                  <span className="tabular-nums">{val}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </Link>
  );
}
