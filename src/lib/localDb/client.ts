import type { PGlite } from "@electric-sql/pglite";

// Browser-only singleton — every consumer must be a Client Component.
// Dynamically imports PGlite so its ~5MB wasm/data assets are never pulled
// into a server bundle or evaluated during SSR.

let dbPromise: Promise<PGlite> | null = null;

async function createClient(): Promise<PGlite> {
  // Some environments (seen in automated browser testing) intermittently
  // fail to write PGlite's wasm/data assets to the HTTP disk cache
  // (net::ERR_CACHE_WRITE_FAILURE), which surfaces as a hard fetch failure.
  // Forcing PGlite's own asset fetches to skip the cache avoids that at
  // negligible cost (these assets are fetched once per session anyway).
  const originalFetch = window.fetch;
  window.fetch = (input, init) => originalFetch(input, { ...init, cache: "no-store" });
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite("idb://project2b");
  window.fetch = originalFetch;

  const schemaCheck = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Game') AS exists`,
  );
  if (!schemaCheck.rows[0]?.exists) {
    const schemaSql = await fetch("/localdb/schema.sql", { cache: "no-store" }).then((r) =>
      r.text(),
    );
    await db.exec(schemaSql);
  }

  return db;
}

export function getDb(): Promise<PGlite> {
  if (!dbPromise) dbPromise = createClient();
  return dbPromise;
}

export function newId(): string {
  return crypto.randomUUID();
}
