import test from "node:test";
import assert from "node:assert/strict";

import {
  extractOutlineFromPdf,
  extractTopLevelSectionTitles,
  mapSectionTitlesToPages,
} from "./sectionOutline.ts";

test("extractTopLevelSectionTitles prefers main tex document and ignores subsections", () => {
  const titles = extractTopLevelSectionTitles([
    {
      relativePath: "appendix.tex",
      fileType: "tex",
      content: String.raw`\section{Appendix Details}`,
    },
    {
      relativePath: "main.tex",
      fileType: "tex",
      content: String.raw`
        \documentclass{article}
        \begin{document}
        \section{Introduction}
        \subsection{Ignored details}
        \section[Method]{Method \textbf{Overview}}
        \appendix
        \section*{Additional Results}
        \section{References}
        \end{document}
      `,
    },
  ]);

  assert.deepEqual(titles, [
    "Introduction",
    "Method Overview",
    "Additional Results",
  ]);
});

test("mapSectionTitlesToPages matches headings in page order", () => {
  const outline = mapSectionTitlesToPages(
    [
      "Title\nAuthors\n\n1 Introduction\nWe introduce the problem.",
      "2 Method\nOur method starts here.",
      "3 Results\nThe main finding is shown.",
    ],
    ["Introduction", "Method", "Results"],
  );

  assert.deepEqual(outline, [
    { title: "Introduction", startPage: 1 },
    { title: "Method", startPage: 2 },
    { title: "Results", startPage: 3 },
  ]);
});

test("extractOutlineFromPdf falls back to numbered headings and dedupes repeats", () => {
  const outline = extractOutlineFromPdf([
    "Paper Title\nAuthors\n\n1 Introduction\nBody text",
    "2 Related Work\nMore text\n\n2 Related Work",
    "3 Experiments\nEven more text",
  ]);

  assert.deepEqual(outline, [
    { title: "1 Introduction", startPage: 1 },
    { title: "2 Related Work", startPage: 2 },
    { title: "3 Experiments", startPage: 3 },
  ]);
});
