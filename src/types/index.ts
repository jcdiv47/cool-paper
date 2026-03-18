export type ImportStage =
  | "queued"
  | "downloading_pdf"
  | "downloading_source"
  | "building_index"
  | "generating_summary";

export type ImportState =
  | { phase: "completed" }
  | { phase: "importing"; stage: ImportStage }
  | { phase: "failed"; error: string };

export interface PaperMetadata {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  summary?: string;
  published: string;
  categories: string[];
  addedAt: string;
  importState: ImportState;
}

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  timestamp: string;
  model?: string;
}

export interface Thread {
  id: string;
  title: string;
  paperIds: string[];
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  model?: string;
  messages: ThreadMessage[];
}

export interface ThreadListItem {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  preview?: string;
}

export interface ChatThreadListItem extends ThreadListItem {
  paperIds: string[];
  paperTitles: string[];
}

export interface ChatRequest {
  paperId: string;
  threadId: string;
  message: string;
  model?: string;
}
