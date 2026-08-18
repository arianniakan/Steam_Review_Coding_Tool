@AGENTS.md

# Project notes for Claude

Read README.md before making architecture assumptions — this app is local-first (no server database; PGlite runs in the browser, `prisma/schema.prisma` is reference-only). Don't reach for `DATABASE_URL` or a Prisma migration; there isn't one.

No automated test suite exists yet. This is intentional and deferred by the project owner, not an oversight — don't re-flag it as a surprise gap.

Deployed on Vercel (`arianniakans-projects/steam-review-coding-tool`), auto-deploying from GitHub pushes to `main`. Verify any deploy-affecting change against the live URL, not just `next dev` — rate limiting and PGlite/WASM bundling both behave differently there (rate limiting no-ops locally without `KV_REST_API_URL`/`KV_REST_API_TOKEN` set).
