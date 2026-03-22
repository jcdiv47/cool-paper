export type ReaderPanel = "summary" | "chat" | "none";

interface PaperWorkspaceHrefOptions {
  panel?: ReaderPanel;
  chat?: boolean;
  view?: "pdf" | "summary" | "split";
  page?: string | number | null;
  cite?: string | null;
  annotation?: string | null;
}

export function buildPaperWorkspaceHref(
  sanitizedId: string,
  options: PaperWorkspaceHrefOptions = {},
): string {
  const params = new URLSearchParams();

  if (options.panel === "chat") {
    params.set("chat", "1");
  }

  if (options.chat) {
    params.set("chat", "1");
  }

  // Explicitly requested view, or auto-switch to PDF when citing/annotating
  const view = options.view ?? (options.cite || options.annotation ? "pdf" : undefined);
  if (view === "pdf") {
    params.set("view", "pdf");
  } else if (view === "split") {
    params.set("view", "split");
  }

  if (options.page !== undefined && options.page !== null) {
    params.set("page", String(options.page));
  }

  if (options.cite) {
    params.set("cite", options.cite);
  }

  if (options.annotation) {
    params.set("annotation", options.annotation);
  }

  const query = params.toString();
  return query ? `/paper/${sanitizedId}?${query}` : `/paper/${sanitizedId}`;
}
