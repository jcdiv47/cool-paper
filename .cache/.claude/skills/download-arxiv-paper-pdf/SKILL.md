---
name: download-arxiv-paper-pdf
description: Download ArXiv Paper PDF file from ArXiv official site.
---

Paper PDFs are stored at `papers/{sanitizedId}/paper.pdf` relative to the working directory, where `sanitizedId` has slashes replaced with underscores.

Use a command like the following to download:

```bash
mkdir -p papers/{sanitizedId}/
curl -L https://arxiv.org/pdf/{arxivId} -o papers/{sanitizedId}/paper.pdf
```
