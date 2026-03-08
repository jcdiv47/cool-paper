"use client";

import { useCallback, useState } from "react";
import { Worker, Viewer } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";

import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";

interface PdfViewerProps {
  paperId: string;
}

export function PdfViewer({ paperId }: PdfViewerProps) {
  const [darkMode, setDarkMode] = useState(true);
  const defaultLayout = defaultLayoutPlugin();

  const handleSwitchTheme = useCallback((theme: string) => {
    setDarkMode(theme === "dark");
  }, []);

  return (
    <div className={`relative h-full w-full pdf-viewer-wrapper ${darkMode ? "bg-[#1a1a1a]" : "bg-[#eee]"}`} data-dark={darkMode || undefined}>
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
        <Viewer
          fileUrl={`/api/papers/${paperId}/pdf`}
          plugins={[defaultLayout]}
          theme={darkMode ? "dark" : "light"}
          onSwitchTheme={handleSwitchTheme}
        />
      </Worker>
    </div>
  );
}
