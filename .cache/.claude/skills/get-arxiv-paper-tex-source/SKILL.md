---
name: get-arxiv-paper-tex-source
description: Get ArXiv Tex source files for an ArXiv paper.
---

When user asks you to obtain an ArXiv paper Tex source, download the compressed file from `https://arxiv.org/src/{arxivId}` where `arxivId` is the ArXiv paper identifier of the form "YYMM.NNNNN" such as "2602.02276".

Paper source files are stored at `papers/{sanitizedId}/source/` relative to the working directory, where `sanitizedId` has slashes replaced with underscores.

First check if the source folder already exists:

```bash
ls papers/{sanitizedId}/source/
```

If it doesn't exist, download and extract:

```bash
curl -L https://arxiv.org/src/{arxivId} -o /tmp/arxiv-{sanitizedId}.tar.gz
mkdir -p papers/{sanitizedId}/source/
tar -xvf /tmp/arxiv-{sanitizedId}.tar.gz -C papers/{sanitizedId}/source/
```
