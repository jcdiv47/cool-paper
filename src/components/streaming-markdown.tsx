"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/**
 * Closes unclosed fenced code blocks, math display blocks, and strips
 * trailing incomplete citation/annotation tokens so partial markdown
 * doesn't break ReactMarkdown during streaming.
 */
function sanitizePartialMarkdown(text: string): string {
  // Close unclosed fenced code blocks (odd count of ```)
  const fenceCount = (text.match(/^```/gm) || []).length;
  if (fenceCount % 2 !== 0) {
    text += "\n```";
  }

  // Close unclosed math display blocks (odd count of $$)
  const mathCount = (text.match(/\$\$/g) || []).length;
  if (mathCount % 2 !== 0) {
    text += "\n$$";
  }

  // Strip trailing incomplete citation tokens like [[cite:... without closing ]]
  text = text.replace(/\[\[(?:cite|annot):[^\]]*$/, "");

  return text;
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [
  rehypeHighlight,
  [rehypeKatex, { throwOnError: false }] as [typeof rehypeKatex, { throwOnError: boolean }],
];

export const StreamingMarkdown = React.memo(
  function StreamingMarkdown({ content }: { content: string }) {
    const sanitized = sanitizePartialMarkdown(content);

    return (
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      >
        {sanitized}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content
);
