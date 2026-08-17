# Steam Reviews Qualitative Coding Tool

A research tool for game studies / qualitative analysis: ingest Steam reviews for a game, build a codebook, tag review segments by hand, and get AI-assisted code suggestions that a researcher must explicitly accept or reject before they count. The tool then measures how well the AI agrees with the human coder using Cohen's kappa — the standard inter-rater reliability statistic from qualitative research methodology.

Most "AI + data" portfolio projects are a chatbot wrapped around a document. This one is different: the AI is a second coder in a real qualitative coding workflow, and its usefulness is measured, not assumed.

## Why this exists

Game studies researchers (and community managers, UX researchers, etc.) routinely need to thematically code large batches of player reviews — tagging spans of text with codes like `performance_complaint` or `abandonment_concern` from a codebook they define. Doing this by hand at scale is slow. Having an LLM do it unsupervised is methodologically indefensible. This tool sits in between: the AI proposes span-level code suggestions with a rationale and confidence score, the researcher accepts or rejects each one, and only accepted suggestions become part of the coded dataset — attributed to a distinct "AI coder," never merged silently into the human's own coding.

## How it works

1. **Ingest** — pull a game's reviews from Steam's public `appreviews` endpoint (no API key required).
2. **Codebook** — define codes with a label, a description (used both by human coders and by the AI prompt), an optional color, and optional parent/child hierarchy.
3. **Manual coding** — select a text span in a review, apply a code, optionally add a memo. Standard qualitative coding.
4. **AI-assisted suggestions** — request suggestions from OpenAI (Structured Outputs, constrained to the codebook's actual code labels via a JSON schema `enum`, so the model can't invent a code that doesn't exist). Each suggestion carries an exact verbatim quote, a rationale, and a confidence score. Nothing is written to the database until the researcher clicks Accept.
5. **Reliability dashboard** — Cohen's kappa between the human coder and the AI coder, computed over every (review, code) presence/absence judgment across the reviews the human has actually examined. Also: code frequency, code co-occurrence, and theme frequency over time.
6. **Export** — the full coded dataset (review text, code, coder, span, memo, AI confidence/rationale) as CSV.

## Data model

```
Game ──< Review ──< Tagging >── Code >── Codebook
                        │
                        └──> Coder (kind: HUMAN | AI)

Game ──< Event        (patch/controversy dates, for the time-series overlay)
Game ──< SavedSample  (named filter presets for the review browser)
```

The key design decision: **`Coder` is one table with a `kind` field**, not a human-only `Researcher` table plus a special-cased `"ai"` string elsewhere. Every `Tagging` has a real foreign key to a real `Coder` row, whether that coder is a human researcher or the reserved AI pseudo-coder. This is what makes the reliability calculation trivial — it's a group-by on `coder.kind`, not a join against two different data shapes.

## Stack

- **Next.js** (App Router, TypeScript) — single deployable app, server components for data fetching, API routes for mutations
- **PostgreSQL + Prisma** — local dev via `prisma dev`; swap `DATABASE_URL` for Supabase (or any Postgres) to deploy
- **OpenAI API** (Structured Outputs / JSON schema) for AI-assisted code suggestions
- No auth system yet — a single hardcoded researcher (`src/lib/coders.ts`) stands in for a login flow, since the data model already treats coders as first-class rows and doesn't need to change when real auth is added

## Running locally

```bash
npm install
npx prisma dev          # starts a local Postgres, prints a DATABASE_URL
# put that DATABASE_URL in .env, and your OpenAI key in .env.local
npx prisma migrate dev
npm run dev
```

Required environment variables:

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `.env` | Postgres connection string |
| `OPENAI_API_KEY` | `.env.local` | AI-assisted code suggestions |
| `OPENAI_MODEL` | `.env.local` (optional) | Defaults to `gpt-4o-mini` |

## How I used AI to build this

This app was built with Claude Code (Anthropic's coding agent), iteratively, one vertical slice at a time — ingestion, then the review browser, then codebook CRUD, then manual coding, then the AI suggestion loop, then the reliability dashboard, then export — verifying each step against a real running Postgres database and a real Steam game's reviews in a browser before moving to the next, rather than writing the whole app and debugging it at the end.

A few decisions worth calling out as genuinely AI-assisted judgment calls, not just code generation:

- **The `Coder` table design** (human and AI as rows in one table, not a special-cased string) came out of explicitly thinking through how the reliability calculation would need to query the data *before* writing the schema — a case where getting the data model right up front avoided an awkward migration later.
- **Cohen's kappa was verified against a hand-computed textbook example** (a classic 2×2 contingency table with a known answer, po=0.75, pe=0.51, κ≈0.4898) before it was trusted in the dashboard — and the implementation correctly handles the degenerate case (perfect agreement with no variance, where kappa is mathematically undefined) by returning `null` rather than a misleading `1.0`.
- **AI suggestions never write to the database directly.** The suggestion endpoint returns candidates only; a suggestion becomes a `Tagging` row through the exact same code path a human's manual tag does, just attributed to the reserved AI `Coder` and carrying its confidence/rationale. This was a deliberate constraint, not an accident of how the code happened to get organized — it's what makes the "human-in-the-loop" claim actually true rather than aspirational.
