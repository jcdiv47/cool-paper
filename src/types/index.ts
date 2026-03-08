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
}

export interface GenerateRequest {
  paperId: string;
  prompt: string;
  noteFilename: string;
}
