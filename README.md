# Steam Reviews Qualitative Coding Tool

**Live:** https://steam-review-coding-tool.vercel.app

A research tool for game studies / qualitative analysis: ingest Steam reviews for a game, build a codebook, tag review segments by hand, and get AI-assisted code suggestions that a researcher must explicitly accept or reject before they count. The tool then measures how well the AI agrees with the human coder using Cohen's kappa — the standard inter-rater reliability statistic from qualitative research methodology.

Most "AI + data" portfolio projects are a chatbot wrapped around a document. This one is different: the AI is a second coder in a real qualitative coding workflow, and its usefulness is measured, not assumed.

## Why this exists

Game studies researchers (and community managers, UX researchers, etc.) routinely need to thematically code large batches of player reviews — tagging spans of text with codes like `performance_complaint` or `abandonment_concern` from a codebook they define. Doing this by hand at scale is slow. Having an LLM do it unsupervised is methodologically indefensible. This tool sits in between: the AI proposes span-level code suggestions with a rationale and confidence score, the researcher accepts or rejects each one, and only accepted suggestions become part of the coded dataset — attributed to a distinct "AI coder," never merged silently into the human's own coding.

## How it works

1. **Ingest** — pull a game's reviews from Steam's public `appreviews` endpoint (no API key required). A game can be re-synced later for more reviews without losing anything already coded, and reviews can be grouped into a **project** to analyze several games under one shared codebook.
2. **Codebook** — define codes with a label, a description (used both by human coders and by the AI prompt), an optional color, and optional parent/child hierarchy. A codebook can also be drafted by AI from a sample of real reviews (adjustable sample size, ratio, and criteria) — nothing is created until the researcher reviews and selects codes. The system prompt sent to the AI is itself editable per codebook, not just the codes.
3. **Manual coding** — select a text span in a review, apply a code, optionally add a memo. A review that turns out to be off-topic or noise can be excluded from a specific codebook's analysis (reversibly — it's still visible under any other codebook on the same game) or have its text corrected in place, with the original preserved and revertible.
4. **AI-assisted suggestions** — request suggestions from OpenAI (Structured Outputs, constrained to the codebook's actual code labels via a JSON schema `enum`, so the model can't invent a code that doesn't exist). Each suggestion carries an exact verbatim quote, a rationale, and a confidence score. Nothing is written to the database until the researcher clicks Accept.
5. **Earn trust before scaling up** — a guided calibration pipeline (draw a one-time random sample → hand-code it blind, with zero AI help → run the AI independently over the same sample → compare agreement via Cohen's kappa → revise the codebook and/or prompt → repeat), following the systematic-coding procedure from Törnberg (2024), *Best Practices for Text Annotation with Large Language Models*. Only after a held-out verification pass actually measures acceptable agreement does the codebook unlock a bulk "auto-code the rest" action — letting the AI code the remaining, untouched corpus unsupervised, in safe, resumable batches — rather than ever trusting an LLM at scale on say-so alone.
6. **Reliability dashboard** — Cohen's kappa between the human coder and the AI coder, computed over every (review, code) presence/absence judgment across the reviews the human has actually examined. Also: code frequency, code co-occurrence, and theme frequency over time.
7. **Export** — the full coded dataset (review text, code, coder, span, memo, AI confidence/rationale) as CSV. The whole project (every game, review, codebook, and tagging) can also be saved to a single portable file and re-opened later — see [Architecture](#architecture-local-first) below.

A codebook is versioned, not edited-in-place (create a new one rather than mutating one mid-analysis), and everything downstream — analytics and export — is scoped to exactly one codebook, since two codebooks can define entirely different codes for entirely different research questions. A researcher's "active codebook" is a single persistent selection carried across the Reviews list, a review's tagging view, and Analytics via a shared toolbar (`Codebook: [switch] · Manage codes · Analytics · Export CSV`), rather than something re-picked on every page.

## Data model

```
Game ──< Review ──< Tagging >── Code >── Codebook >── Project
                        │                    │
                        ├──> Coder (kind: HUMAN | AI)
                        ├──< RejectedSuggestion   (an AI suggestion a human rejected, with its rationale)
                        └──< ReviewRelevance      (per-codebook "exclude this review", reversible)

Codebook ──< CodebookTraining ──< ReviewSplitAssignment  (the calibration/test/verification split)
                               └──< AutoCodeAttempt       (bulk unsupervised coding, once verified)

Game ──< Event        (patch/controversy dates, for the time-series overlay)
Game ──< SavedSample  (named filter presets for the review browser)
Game >─< Project      (a project groups several games under one shared codebook)
```

The key design decision: **`Coder` is one table with a `kind` field**, not a human-only `Researcher` table plus a special-cased `"ai"` string elsewhere. Every `Tagging` has a real foreign key to a real `Coder` row, whether that coder is a human researcher or the reserved AI pseudo-coder. This is what makes the reliability calculation trivial — it's a group-by on `coder.kind`, not a join against two different data shapes.

A `Codebook` belongs to exactly one `Game` or one `Project`, never neither and never both (a database constraint enforces it) — a project-scoped codebook analyzes across every game in the project at once, which is the whole point of grouping games together in the first place.

## Architecture: local-first

This app has no server-side database. Every visitor's data — games, reviews, codebooks, codes, taggings, everything — lives entirely in their own browser, in [PGlite](https://pglite.dev/) (Postgres compiled to WebAssembly) persisted to IndexedDB. Vercel's role is limited to serving the app shell and proxying the two things that need a server-held secret: Steam ingestion and the OpenAI calls.

**Why**: the alternative was a shared hosted Postgres, which meant either building real multi-user auth or having every visitor collide under one hardcoded identity. Local-first sidesteps the problem entirely — no accounts, no server database, and each browser is naturally isolated from every other.

**Consequences that fell out of that choice:**

- **No Prisma Client at runtime.** Prisma isn't designed to run in a browser, and no adapter exists for this project's generator. `prisma/schema.prisma` stays as documentation of the data shape; the actual queries are hand-written parameterized SQL in `src/lib/localDb/queries/*.ts`, ported 1:1 from the original Prisma calls.
- **The AI routes are stateless proxies.** Since the caller already has the relevant data loaded locally, the client sends the review text / codebook / sampled reviews directly in the request body; the route's only job is the OpenAI call. Steam ingestion works the same way in reverse — the server fetches from Steam (a browser can't, directly) and streams the results back for the client to write locally.
- **"Save project" / "Open project"** wraps PGlite's own `dumpDataDir()` / `loadDataDir` — the entire local database serializes to one portable `.tar.gz` file and back. This is a researcher's backup/sharing mechanism (e.g. handing an exact analysis to an advisor), and it's also how first-time visitors get bootstrapped:
- **Seed data on first visit.** A brand-new browser would otherwise land on a completely empty app. Instead, a `localStorage` flag detects a genuine first visit (checked against `indexedDB.databases()` too, so a merely-cleared flag can never seed over a real local database) and loads `public/localdb/seed.tar.gz` — a real worked example (a fully ingested game, an AI-generated codebook, human- and AI-coded reviews with a real kappa score) — instead of bootstrapping an empty schema.
- **The public AI routes needed their own guardrails.** With no accounts, `suggest-codes` and `suggest-codebook` are reachable by anyone who finds the URL. They're protected by per-IP rate limiting (Upstash Redis via Vercel's KV storage integration — 20 requests/hour for code suggestions, 5/hour for the pricier codebook-generation sampling call), input length caps, and a `max_tokens` ceiling on the OpenAI calls. Remaining quota is surfaced in the UI (a small usage bar next to each AI button) rather than failing silently.

Git history reflects this migration: the `main` branch is the current local-first app; `initial-prototype` preserves the original server-hosted Prisma + Postgres version for reference.

## Stack

- **Next.js 16** (App Router, TypeScript) — client components throughout (there's no server data to fetch); a handful of thin API routes for the OpenAI proxies, Steam ingestion, and exposing a couple of server-only config values (quota, batch size) to the client
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
| `RATE_LIMIT_SUGGEST_CODES_LIMIT` / `RATE_LIMIT_SUGGEST_CODEBOOK_LIMIT` | `.env.local` (optional) | Overrides the default per-hour request budgets (20 / 5) set in `src/lib/rateLimit.ts`. Only relevant if `KV_REST_API_URL`/`KV_REST_API_TOKEN` are also set — intended for a private, non-public deployment (e.g. for actual research use) that wants Redis-backed protection against runaway bugs without being capped at the public demo's conservative numbers |
| `AUTO_CODE_BATCH_SIZE` | `.env.local` (optional) | Defaults to 25 — how many reviews the "auto-code the rest" action processes per click once a codebook's calibration is verified |

No database setup needed — PGlite bootstraps its own schema (`public/localdb/schema.sql`) in the browser on first load.

## How I used AI to build this

This app was built with Claude Code (Anthropic's coding agent), iteratively, one vertical slice at a time, each phase verified against a real running app before moving to the next:

**Phase 1 — the original build**, server-hosted on Postgres via Prisma: ingestion, then the review browser, then codebook CRUD, then manual coding, then the AI suggestion loop, then the reliability dashboard, then export — verifying each step against a real running database and a real Steam game's reviews before moving to the next.

**Phase 2 — the local-first migration**, prompted by realizing the server-hosted version would need real auth to host safely for others. Before touching any code, the question "can Prisma Client even run in a browser?" was researched and answered (no) — which is what set the direction toward hand-writing the SQL layer instead of reaching for a risky, unverified adapter. The whole migration happened on a separate branch, committed and pushed after each verified step, so the original working version stayed intact throughout. The riskiest unknown (whether PGlite's WASM bundling behaves the same under a real production build as under `next dev`) was deliberately tested — a full `next build` + `next start` cycle, with a real Steam ingest run against it — before the migration was considered done.

**Phase 3 — hardening**, after an honest self-assessment of the deployed app surfaced a real gap: the two OpenAI routes were public and unauthenticated, with no rate limiting. That became per-IP limiting via Upstash, input/output bounds on the OpenAI calls, and a visible quota indicator so the limit is communicated rather than just enforced. The same pass caught and fixed a genuine race condition in the AI-coder upsert logic (a SELECT-then-INSERT that two near-simultaneous "Accept suggestion" clicks could both pass, then collide on) — reproduced directly against the database, fixed with an atomic `ON CONFLICT` upsert, and re-verified against the same reproduction.

**Phase 4 — navigation, from real usage rather than a checklist.** Using the deployed app surfaced a genuine information-architecture problem: Analytics and CSV export were only reachable by drilling into a specific codebook's code-editing view, with no consistent sense of which codebook a researcher was even "in" as they moved between pages. Fixing it properly meant first identifying the real constraint underneath the UI question — analytics is inherently scoped to one codebook's codeset, since two codebooks can define incompatible codes for different research questions, so "which codebook is active" had to become one persistent, shared piece of state rather than a per-page dropdown. That surfaced a second, real bug in the process: a review's displayed taggings were pulling from every codebook at once rather than the active one, which the fix corrected as a side effect of making the scoping consistent. The resulting design — a shared toolbar carried by URL across Reviews, a review's tagging view, and Analytics — went through several rounds of direct feedback (button grouping that visually implied the wrong relationships between actions, an empty codebook select) before landing.

**Phase 5 — implementing a published paper's methodology as a guided workflow.** The reliability dashboard could measure human/AI agreement, but nothing in the app let a researcher act on that number — there was no way to calibrate before trusting the model at scale. Built phase by phase, this became a direct implementation of the systematic-coding procedure from Törnberg (2024), *Best Practices for Text Annotation with Large Language Models*: draw a one-time held-out sample, hand-code it blind with zero AI visibility (interleaving the two would measure rubber-stamping, not agreement), run the AI independently over the same sample, compare via Cohen's kappa, revise the codebook, repeat — then lock the codebook, validate once more on a separate blind sample, and only then unlock bulk auto-coding of the rest of the corpus. Building it in this order surfaced a genuine correctness bug: the independent AI pass legitimately returning "no codes apply" for a review wrote no `Tagging` row at all, making "the model looked and found nothing" indistinguishable from "never ran" — which would have silently undercounted every kappa calculation and permanently blocked the verification gate the first time it happened for real. Fixed by tracking the attempt itself, not just its output.

**Phase 6 — going back to the source, and correcting a wrong assumption.** Asked whether prompt editing mattered to the paper's methodology, the first answer (recalled from an earlier read, not re-checked) was that codebook revision was primary and prompt tuning secondary. Re-reading the actual paper corrected that: its core procedure treats "revise the codebook and/or the LLM prompt" as one unified step, with neither ranked above the other. That correction became a feature — a per-codebook system prompt, editable with the same lock/version lifecycle the codes already had, extracted from a previously hardcoded constant so the UI shows the researcher the literal text actually being sent rather than a paraphrase that could drift out of sync.

**Phase 7 — auditing the app as a stranger would see it.** Rather than waiting for more scattered feedback, the next pass worked through the entire app cold, as a first-time user, surfacing and ranking a dozen real friction points: a local-first app with no reminder to ever save (the only backup mechanism was remembering to click a button), inconsistent loading states, a review-filter panel giving no visibility into which filters were active, and more. Verifying the fix for one of them — mobile responsiveness — caught a genuine bug live, in a 375px-wide browser: a dense toolbar refusing to wrap was forcing real horizontal scroll on the whole page. Fixed on the spot, in the same pass meant to catch exactly that kind of thing.

**Phase 8 — the part of the app with no UI at all.** None of the above touched the actual review data bank — there was no way to re-sync a game, delete a review, or correct one, despite the database schema already being fully cascade-ready for exactly that. Building it out surfaced another real correctness risk before it shipped: letting a researcher manually fix a review's text, combined with the existing "re-sync from Steam" action, meant the very next sync would silently overwrite the correction with Steam's original text again. Caught and fixed — the original is now preserved and re-syncs skip re-fetching text for anything manually edited — and verified live against a real 1000-review re-sync before being called done. A live production bug surfaced right after: Steam's own anti-bot protection started redirecting the review-ingestion endpoint instead of returning data, which the app was swallowing as a raw, cryptic JSON-parse error. Diagnosed by reproducing it directly (via `curl`, from multiple unrelated networks, against both a brand-new game and one that had ingested fine before) to rule out a regression in this app's own code before concluding it was Steam's infrastructure, not ours — and fixed to fail with a clear, honest message instead of trying to disguise requests to get around someone else's anti-bot measures.

A few decisions worth calling out as genuinely AI-assisted judgment calls, not just code generation:

- **The `Coder` table design** (human and AI as rows in one table, not a special-cased string) came out of explicitly thinking through how the reliability calculation would need to query the data *before* writing the schema — a case where getting the data model right up front avoided an awkward migration later.
- **Cohen's kappa was verified against a hand-computed textbook example** (a classic 2×2 contingency table with a known answer, po=0.75, pe=0.51, κ≈0.4898) before it was trusted in the dashboard — and the implementation correctly handles the degenerate case (perfect agreement with no variance, where kappa is mathematically undefined) by returning `null` rather than a misleading `1.0`.
- **AI suggestions never write to the database directly.** The suggestion endpoint returns candidates only; a suggestion becomes a `Tagging` row through the exact same code path a human's manual tag does, just attributed to the reserved AI `Coder` and carrying its confidence/rationale. This was a deliberate constraint, not an accident of how the code happened to get organized — it's what makes the "human-in-the-loop" claim actually true rather than aspirational.
- **"Flag or exclude, never silently mutate or delete"** is a pattern applied consistently as the app grew: a rejected AI suggestion is captured on its own table rather than just dropped from local state; a review judged not relevant to a codebook's research question is marked reversibly rather than hidden with no trace; a manually corrected review's original text is preserved rather than overwritten. Each of these could have been simpler one-way operations — the judgment call was that a research tool should make its own history inspectable and reversible by default.
- **Choosing local-first over adding auth** was a product decision as much as a technical one — it trades multi-device sync for zero-friction access (no signup to try the tool) and a genuinely stronger privacy story (a researcher's data never leaves their own browser unless they explicitly export it).
