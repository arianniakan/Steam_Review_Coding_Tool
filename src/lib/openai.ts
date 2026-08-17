import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as { openai?: OpenAI };

export const openai =
  globalForOpenAI.openai ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

if (process.env.NODE_ENV !== "production") {
  globalForOpenAI.openai = openai;
}

// Configurable via env so this doesn't need a code change when a cheaper or
// newer model becomes available — check your OpenAI dashboard for current
// options. gpt-4o-mini is a safe, long-stable default that supports
// Structured Outputs.
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
