import type { TaskType } from "@/lib/agent";

export interface PaperMetadata {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  categories: string[];
  addedAt: string;
}

export interface NoteFile {
  filename: string;
  title: string;
  modifiedAt: string;
  snippet?: string;
  model?: string;
}

export interface GenerateRequest {
  paperId: string;
  prompt: string;
  noteFilename: string;
  taskType?: TaskType;
  model?: string;
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

export interface RecentNote {
  paperId: string;
  paperTitle: string;
  filename: string;
  title: string;
  modifiedAt: string;
  model?: string;
}

export interface ChatRequest {
  paperId: string;
  threadId: string;
  message: string;
  model?: string;
}
