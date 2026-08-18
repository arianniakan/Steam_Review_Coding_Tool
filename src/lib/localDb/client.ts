import type { PGlite } from "@electric-sql/pglite";

// Browser-only singleton — every consumer must be a Client Component.
// Dynamically imports PGlite so its ~5MB wasm/data assets are never pulled
// into a server bundle or evaluated during SSR.

let dbPromise: Promise<PGlite> | null = null;

async function createClient(loadDataDir?: Blob | File): Promise<PGlite> {
  // Some environments (seen in automated browser testing) intermittently
  // fail to write PGlite's wasm/data assets to the HTTP disk cache
  // (net::ERR_CACHE_WRITE_FAILURE), which surfaces as a hard fetch failure.
  // Forcing PGlite's own asset fetches to skip the cache avoids that at
  // negligible cost (these assets are fetched once per session anyway).
  const originalFetch = window.fetch;
  window.fetch = (input, init) => originalFetch(input, { ...init, cache: "no-store" });

  try {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite("idb://project2b", loadDataDir ? { loadDataDir } : undefined);

    // Constructing PGlite doesn't wait for its internal asset loading to
    // finish — that happens lazily and only becomes observable (awaitable)
    // once the first real query runs. Keep the cache-bypass patch active
    // through this first query so any deferred asset fetches are covered
    // too, not just the ones triggered synchronously during construction.
    const schemaCheck = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Game') AS exists`,
    );
    // A loaded dump already has the full schema — only bootstrap a fresh one
    // when there's nothing to load and no schema exists yet.
    if (!loadDataDir && !schemaCheck.rows[0]?.exists) {
      const schemaSql = await originalFetch("/localdb/schema.sql", { cache: "no-store" }).then(
        (r) => r.text(),
      );
      await db.exec(schemaSql);
    }

    return db;
  } finally {
    window.fetch = originalFetch;
  }
}

export function getDb(): Promise<PGlite> {
  if (!dbPromise) dbPromise = createClient();
  return dbPromise;
}

// Replaces the current database entirely with one restored from a
// previously-exported project file (see projectFile.ts). Used for "Open
// project" — closes the existing connection and re-initializes against the
// same idb:// name so it keeps persisting normally afterward.
export async function resetDbFromFile(file: File): Promise<void> {
  if (dbPromise) {
    const existing = await dbPromise;
    await existing.close();
  }
  dbPromise = createClient(file);
  await dbPromise;
}

export function newId(): string {
  return crypto.randomUUID();
}
