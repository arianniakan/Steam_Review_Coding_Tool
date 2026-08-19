# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build — verify PGlite/WASM bundling before trusting a local-first change
npm start         # serve the production build locally
npm run lint      # eslint
npx tsc --noEmit  # type-check (no dedicated script; this is the actual verification command used)
```

No automated test suite exists. This is intentional and deferred by the project owner, not an oversight — don't flag it as a surprise gap or invent a test command.

## Architecture

**This app is local-first: there is no server-side database.** Every visitor's data (games, reviews, codebooks, codes, taggings) lives entirely in their own browser via [PGlite](https://pglite.dev/) (Postgres compiled to WebAssembly), persisted to IndexedDB. Vercel only serves the app shell and proxies the two things that need a server-held secret (OpenAI, Steam ingestion). Read README.md's "Architecture: local-first" section for the full reasoning before assuming a server DB exists.

- `prisma/schema.prisma` and `prisma/migrations/` are **documentation only** — never executed. The real runtime schema is `public/localdb/schema.sql`, applied by PGlite itself in the browser on first load. Don't reach for `DATABASE_URL` or `prisma migrate`; there isn't one.
- **Data access**: `src/lib/localDb/client.ts` exports `getDb()`, a module-level singleton `Promise<PGlite>` (dynamically imported so its ~5MB WASM assets never enter the server bundle). All queries live in `src/lib/localDb/queries/*.ts`, one file per resource, hand-written parameterized SQL ported 1:1 from the schema's shape — no ORM at runtime.
- **First-visit seeding**: a brand-new browser loads `public/localdb/seed.tar.gz` (a real worked example) instead of an empty schema. This decision has to happen *before* constructing PGlite, since `loadDataDir` is constructor-only — see the `isFirstVisit`/`hasExistingLocalDatabase` logic in `client.ts`.
- **Save/Open project file** (`src/lib/localDb/projectFile.ts`) wraps PGlite's `dumpDataDir()`/`loadDataDir` for a portable `.tar.gz` export/import of the whole local database. Gotcha: PGlite refuses `loadDataDir` if the target database already has data (`"Database already exists, cannot load from tarball"`) — `resetDbFromFile` in `client.ts` explicitly deletes the underlying IndexedDB store first, and nulls the singleton *before* that delete so a failed import can't leave later queries pointed at a closed connection.
- **Only 4 API routes exist, all thin**: `suggest-codes` and `suggest-codebook` are fully stateless OpenAI proxies (the client already has the relevant data locally and sends it in the request body; the route's only job is the OpenAI call). `ingest` fetches from Steam and returns JSON with no DB writes — the client does the local upsert after. `rate-limit-status` is a non-consuming quota peek.
- **Rate limiting** (`src/lib/rateLimit.ts`): Upstash Redis via Vercel's KV storage integration — env vars are `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Vercel's dashboard naming, not Upstash's own `UPSTASH_*`, though both are checked). `RATE_LIMIT_BUCKETS` is the single source of truth for both enforcement (`checkRateLimit`, used by the AI routes) and the non-consuming client-facing peek (`peekRateLimit`, backing `rate-limit-status`) — keep them reading from the same config so they can't drift. Gracefully no-ops when the env vars are absent (local dev has no rate limiting by default).
- **Active-codebook navigation** (`src/lib/activeCodebook.ts` + `src/components/CodebookToolbar.tsx`): a codebook is the unit Analytics/export are scoped to — different codebooks can define incompatible codesets, so there's no "all codebooks" aggregate view. "Active codebook" resolves URL param → `localStorage` (per game) → first-in-list, threaded via a shared `?codebookId=` param across the Reviews list, a review's tagging view, and Analytics so it's one persistent selection rather than re-picked per page. Tagging queries (`listTaggingsForReview`, `countCodedReviews`, `listReviews`) take a `codebookId` to scope what's shown/counted to the active codebook only — a review can technically carry taggings from multiple codebooks, but the UI only ever shows the active one's.
- **`Coder` table design**: one table with a `kind: HUMAN | AI` field, not a separate human/AI concept — every `Tagging` has a real FK to a `Coder` row regardless of kind. This is what makes the Cohen's kappa computation (`src/lib/kappa.ts`) a simple group-by rather than a join across different shapes.

**Git branches**: `main` is the current local-first app. `initial-prototype` preserves the original server-hosted Prisma+Postgres version for historical reference — not maintained, don't merge into it.

**Deployment**: Vercel project `arianniakans-projects/steam-review-coding-tool`, auto-deploying from GitHub pushes to `main`. PGlite/WASM bundling and rate-limiting both behave differently there than under `next dev` (rate limiting no-ops locally without the KV env vars set) — verify any deploy-affecting change against the live URL, not just local dev.
