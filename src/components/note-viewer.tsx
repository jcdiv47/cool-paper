"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

interface NoteViewerProps {
  paperId: string;
  filename: string;
}

interface NoteData {
  content: string;
}

export function NoteViewer({ paperId, filename }: NoteViewerProps) {
  const { data, loading } = useCachedFetch<NoteData>(
    `/api/papers/${paperId}/notes/${encodeURIComponent(filename)}`,
    { cacheKey: `paper:note:${paperId}:${filename}` }
  );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-4 sm:py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-8">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <article className="prose prose-zinc dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeHighlight, rehypeKatex]}
            >
              {data?.content || ""}
            </ReactMarkdown>
          </article>
        )}
        </div>
      </div>
    </div>
  );
}
