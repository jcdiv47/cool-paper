The main entrance of Tex source for the ArXiv paper is usually `main.tex`. Look for other tex file if it does not exist.

Paper source files are located at `papers/{sanitizedId}/source/` where `sanitizedId` is the ArXiv paper ID with slashes replaced by underscores (e.g., `2301.07041` or `hep-th_0601001`).

Obtain abstract content with command:

```bash
sed -n '/begin{abstract}/,/end{abstract}/p' papers/{sanitizedId}/source/main.tex
```
