export const QUICK_PROMPTS = [
  { label: "Summary", value: "summary" },
  { label: "Key Findings", value: "key-findings" },
  { label: "Methodology", value: "methodology" },
  { label: "Critical Review", value: "critical-review" },
  { label: "Equations", value: "equations" },
] as const;

export const PROMPT_TEMPLATES: Record<string, string> = {
  summary:
    "Read the paper source files and write a comprehensive summary. Include the main contributions, key results, and significance of the work.",
  "key-findings":
    "Read the paper source files and extract the key findings. List each finding with supporting evidence from the paper.",
  methodology:
    "Read the paper source files and describe the methodology in detail. Include the approach, experimental setup, datasets, and evaluation metrics.",
  "critical-review":
    "Read the paper source files and write a critical review. Discuss strengths, weaknesses, limitations, and potential improvements.",
  equations:
    "Read the paper source files and extract the key equations. Explain each equation, its variables, and its significance in the paper's context.",
};
