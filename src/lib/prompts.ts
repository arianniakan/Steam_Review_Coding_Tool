// Shared prompt constants — extracted so the same text used by the API
// route is what a researcher sees/edits in the UI, rather than a
// hand-copied paraphrase that can drift out of sync.

export const DEFAULT_SUGGEST_CODES_SYSTEM_PROMPT =
  "You are assisting a qualitative researcher coding Steam game reviews. " +
  "Given a codebook (a list of codes with descriptions defining when each applies) " +
  "and a single review, propose codes that apply. For each suggestion, quote the " +
  "exact verbatim substring of the review text that justifies the code (do not " +
  "paraphrase — it must be an exact substring), give a one-sentence rationale tied " +
  "to the code's description, and a confidence between 0 and 1. Only use codes from " +
  "the given list. Propose zero suggestions if nothing in the review matches any code " +
  "— do not force a fit.";
