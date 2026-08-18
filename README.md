# Steam Reviews Qualitative Coding Tool

**Live:** https://steam-review-coding-tool.vercel.app

A research tool for game studies / qualitative analysis: ingest Steam reviews for a game, build a codebook, tag review segments by hand, and get AI-assisted code suggestions that a researcher must explicitly accept or reject before they count. The tool then measures how well the AI agrees with the human coder using Cohen's kappa — the standard inter-rater reliability statistic from qualitative research methodology.

Most "AI + data" portfolio projects are a chatbot wrapped around a document. This one is different: the AI is a second coder in a real qualitative coding workflow, and its usefulness is measured, not assumed.

## Why this exists

Game studies researchers (and community managers, UX researchers, etc.) routinely need to thematically code large batches of player reviews — tagging spans of text with codes like `performance_complaint` or `abandonment_concern` from a codebook they define. Doing this by hand at scale is slow. Having an LLM do it unsupervised is methodologically indefensible. This tool sits in between: the AI proposes span-level code suggestions with a rationale and confidence score, the researcher accepts or rejects each one, and only accepted suggestions become part of the coded dataset — attributed to a distinct "AI coder," never merged silently into the human's own coding.

## How it works

1. **Ingest** — pull a game's reviews from Steam's public `appreviews` endpoint (no API key required).
2. **Codebook** — define codes with a label, a description (used both by human coders and by the AI prompt), an optional color, and optional parent/child hierarchy. A codebook can also be drafted by AI from a sample of real reviews (adjustable sample size, ratio, and criteria) — nothing is created until the researcher reviews and selects codes.
3. **Manual coding** — select a text span in a review, apply a code, optionally add a memo.
4. **AI-assisted suggestions** — request suggestions from OpenAI (Structured Outputs, constrained to the codebook's actual code labels via a JSON schema `enum`, so the model can't invent a code that doesn't exist). Each suggestion carries an exact verbatim quote, a rationale, and a confidence score. Nothing is written to the database until the researcher clicks Accept.
5. **Reliability dashboard** — Cohen's kappa between the human coder and the AI coder, computed over every (review, code) presence/absence judgment across the reviews the human has actually examined. Also: code frequency, code co-occurrence, and theme frequency over time.
6. **Export** — the full coded dataset (review text, code, coder, span, memo, AI confidence/rationale) as CSV. The whole project (every game, review, codebook, and tagging) can also be saved to a single portable file and re-opened later — see [Architecture](#architecture-local-first) below.

A codebook is versioned, not edited-in-place (create a new one rather than mutating one mid-analysis), and everything downstream — analytics and export — is scoped to exactly one codebook, since two codebooks can define entirely different codes for entirely different research questions. A researcher's "active codebook" is a single persistent selection carried across the Reviews list, a review's tagging view, and Analytics via a shared toolbar (`Codebook: [switch] · Manage codes · Analytics · Export CSV`), rather than something re-picked on every page.

## Data model

```
Game ──< Review ──< Tagging >── Code >── Codebook
                        │
                        └──> Coder (kind: HUMAN | AI)

Game ──< Event        (patch/controversy dates, for the time-series overlay)
Game ──< SavedSample  (named filter presets for the review browser)
```

The key design decision: **`Coder` is one table with a `kind` field**, not a human-only `Researcher` table plus a special-cased `"ai"` string elsewhere. Every `Tagging` has a real foreign key to a real `Coder` row, whether that coder is a human researcher or the reserved AI pseudo-coder. This is what makes the reliability calculation trivial — it's a group-by on `coder.kind`, not a join against two different data shapes.

## Architecture: local-first

This app has no server-side database. Every visitor's data — games, reviews, codebooks, codes, taggings, everything — lives entirely in their own browser, in [PGlite](https://pglite.dev/) (Postgres compiled to WebAssembly) persisted to IndexedDB. Vercel's role is limited to serving the app shell and proxying the two things that need a server-held secret: Steam ingestion and the OpenAI calls.

**Why**: the alternative was a shared hosted Postgres, which meant either building real multi-user auth or having every visitor collide under one hardcoded identity. Local-first sidesteps the problem entirely — no accounts, no server database, and each browser is naturally isolated from every other.

**Consequences that fell out of that choice:**

- **No Prisma Client at runtime.** Prisma isn't designed to run in a browser, and no adapter exists for this project's generator. `prisma/schema.prisma` stays as documentation of the data shape; the actual queries are hand-written parameterized SQL in `src/lib/localDb/queries/*.ts`, ported 1:1 from the original Prisma calls.
- **The two OpenAI routes are stateless proxies.** Since the caller already has the relevant data loaded locally, the client sends the review text / codebook / sampled reviews directly in the request body; the route's only job is the OpenAI call.
- **"Save project" / "Open project"** wraps PGlite's own `dumpDataDir()` / `loadDataDir` — the entire local database serializes to one portable `.tar.gz` file and back. This is a researcher's backup/sharing mechanism (e.g. handing an exact analysis to an advisor), and it's also how first-time visitors get bootstrapped:
- **Seed data on first visit.** A brand-new browser would otherwise land on a completely empty app. Instead, a `localStorage` flag detects a genuine first visit (checked against `indexedDB.databases()` too, so a merely-cleared flag can never seed over a real local database) and loads `public/localdb/seed.tar.gz` — a real worked example (a fully ingested game, an AI-generated codebook, human- and AI-coded reviews with a real kappa score) — instead of bootstrapping an empty schema.
- **The public AI routes needed their own guardrails.** With no accounts, `suggest-codes` and `suggest-codebook` are reachable by anyone who finds the URL. They're protected by per-IP rate limiting (Upstash Redis via Vercel's KV storage integration — 20 requests/hour for code suggestions, 5/hour for the pricier codebook-generation sampling call), input length caps, and a `max_tokens` ceiling on the OpenAI calls. Remaining quota is surfaced in the UI (a small usage bar next to each AI button) rather than failing silently.

Git history reflects this migration: the `main` branch is the current local-first app; `initial-prototype` preserves the original server-hosted Prisma + Postgres version for reference.

## Stack

- **Next.js 16** (App Router, TypeScript) — client components throughout (there's no server data to fetch), two API routes for the OpenAI proxies plus Steam ingestion
- **PGlite** — Postgres-in-WASM, running entirely in the browser, persisted to IndexedDB
- **OpenAI API** (Structured Outputs / JSON schema) for AI-assisted code suggestions and codebook drafting
- **Upstash Redis** (via Vercel's KV storage integration) for rate limiting the public AI routes
- **Vercel** — hosting, with GitHub-connected auto-deploy on push to `main`

## Running locally

```bash
npm install
npm run dev
```

Only one environment variable is required:

| Variable | Where | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | `.env.local` | AI-assisted code suggestions and codebook drafting |
| `OPENAI_MODEL` | `.env.local` (optional) | Defaults to `gpt-4o-mini` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | `.env.local` (optional) | Enables rate limiting; without them the app runs fine locally with rate limiting simply disabled |

No database setup needed — PGlite bootstraps its own schema (`public/localdb/schema.sql`) in the browser on first load.

## How I used AI to build this

This app was built with Claude Code (Anthropic's coding agent), iteratively, one vertical slice at a time. It went through two major phases:

**Phase 1 — the original build**, server-hosted on Postgres via Prisma: ingestion, then the review browser, then codebook CRUD, then manual coding, then the AI suggestion loop, then the reliability dashboard, then export — verifying each step against a real running database and a real Steam game's reviews before moving to the next.

**Phase 2 — the local-first migration**, prompted by realizing the server-hosted version would need real auth to host safely for others. Before touching any code, the question "can Prisma Client even run in a browser?" was researched and answered (no) — which is what set the direction toward hand-writing the SQL layer instead of reaching for a risky, unverified adapter. The whole migration happened on a separate branch, committed and pushed after each verified step, so the original working version stayed intact throughout. The riskiest unknown (whether PGlite's WASM bundling behaves the same under a real production build as under `next dev`) was deliberately tested — a full `next build` + `next start` cycle, with a real Steam ingest run against it — before the migration was considered done.

**Phase 3 — hardening**, after an honest self-assessment of the deployed app surfaced a real gap: the two OpenAI routes were public and unauthenticated, with no rate limiting. That became per-IP limiting via Upstash, input/output bounds on the OpenAI calls, and a visible quota indicator so the limit is communicated rather than just enforced. The same pass caught and fixed a genuine race condition in the AI-coder upsert logic (a SELECT-then-INSERT that two near-simultaneous "Accept suggestion" clicks could both pass, then collide on) — reproduced directly against the database, fixed with an atomic `ON CONFLICT` upsert, and re-verified against the same reproduction.

**Phase 4 — navigation, from real usage rather than a checklist.** Using the deployed app surfaced a genuine information-architecture problem: Analytics and CSV export were only reachable by drilling into a specific codebook's code-editing view, with no consistent sense of which codebook a researcher was even "in" as they moved between pages. Fixing it properly meant first identifying the real constraint underneath the UI question — analytics is inherently scoped to one codebook's codeset, since two codebooks can define incompatible codes for different research questions, so "which codebook is active" had to become one persistent, shared piece of state rather than a per-page dropdown. That surfaced a second, real bug in the process: a review's displayed taggings were pulling from every codebook at once rather than the active one, which the fix corrected as a side effect of making the scoping consistent. The resulting design — a shared toolbar carried by URL across Reviews, a review's tagging view, and Analytics — went through several rounds of direct feedback (button grouping that visually implied the wrong relationships between actions, an empty codebook select) before landing.

A few decisions worth calling out as genuinely AI-assisted judgment calls, not just code generation:

- **The `Coder` table design** (human and AI as rows in one table, not a special-cased string) came out of explicitly thinking through how the reliability calculation would need to query the data *before* writing the schema — a case where getting the data model right up front avoided an awkward migration later.
- **Cohen's kappa was verified against a hand-computed textbook example** (a classic 2×2 contingency table with a known answer, po=0.75, pe=0.51, κ≈0.4898) before it was trusted in the dashboard — and the implementation correctly handles the degenerate case (perfect agreement with no variance, where kappa is mathematically undefined) by returning `null` rather than a misleading `1.0`.
- **AI suggestions never write to the database directly.** The suggestion endpoint returns candidates only; a suggestion becomes a `Tagging` row through the exact same code path a human's manual tag does, just attributed to the reserved AI `Coder` and carrying its confidence/rationale. This was a deliberate constraint, not an accident of how the code happened to get organized — it's what makes the "human-in-the-loop" claim actually true rather than aspirational.
- **Choosing local-first over adding auth** was a product decision as much as a technical one — it trades multi-device sync for zero-friction access (no signup to try the tool) and a genuinely stronger privacy story (a researcher's data never leaves their own browser unless they explicitly export it).
