import fs from "fs/promises";
import path from "path";
import { paperDir } from "./constants";
import type { NoteFile } from "@/types";

function notesDir(sanitizedId: string): string {
  return path.join(paperDir(sanitizedId), "notes");
}

export async function listNotes(sanitizedId: string): Promise<NoteFile[]> {
  const dir = notesDir(sanitizedId);
  try {
    await fs.mkdir(dir, { recursive: true });
    const files = await fs.readdir(dir);
    const notes: NoteFile[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const stat = await fs.stat(path.join(dir, file));
      notes.push({
        filename: file,
        title: file.replace(/\.md$/, "").replace(/[-_]/g, " "),
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    notes.sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );
    return notes;
  } catch {
    return [];
  }
}

export async function getNote(
  sanitizedId: string,
  filename: string
): Promise<string | null> {
  try {
    const filePath = path.join(notesDir(sanitizedId), filename);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function saveNote(
  sanitizedId: string,
  filename: string,
  content: string
): Promise<void> {
  const dir = notesDir(sanitizedId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), content);
}

export async function searchNotes(
  sanitizedId: string,
  query: string
): Promise<NoteFile[]> {
  const all = await listNotes(sanitizedId);
  if (!query) return all;

  const lower = query.toLowerCase();
  const results: NoteFile[] = [];

  for (const note of all) {
    if (note.title.toLowerCase().includes(lower)) {
      results.push(note);
      continue;
    }
    const content = await getNote(sanitizedId, note.filename);
    if (content && content.toLowerCase().includes(lower)) {
      const idx = content.toLowerCase().indexOf(lower);
      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + query.length + 40);
      const snippet =
        (start > 0 ? "…" : "") +
        content.slice(start, end).replace(/\n/g, " ") +
        (end < content.length ? "…" : "");
      results.push({ ...note, snippet });
    }
  }

  return results;
}

export async function deleteNote(
  sanitizedId: string,
  filename: string
): Promise<void> {
  const filePath = path.join(notesDir(sanitizedId), filename);
  await fs.unlink(filePath);
}
