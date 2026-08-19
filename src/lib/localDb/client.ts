import type { PGlite } from "@electric-sql/pglite";

// Browser-only singleton — every consumer must be a Client Component.
// Dynamically imports PGlite so its ~5MB wasm/data assets are never pulled
// into a server bundle or evaluated during SSR.

const PGLITE_IDB_NAME = "/pglite/project2b";
const INIT_FLAG_KEY = "project2b-initialized";

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

// A brand-new visitor gets pre-loaded with a real example analysis (see
// public/localdb/seed.tar.gz) instead of an empty app. This has to be
// decided *before* constructing PGlite, since loadDataDir is a
// constructor-only option — by the time a query could tell us the database
// is empty, it's too late to load the seed into it. A localStorage flag
// tracks whether this browser has already been initialized (by either the
// seed or a blank schema); indexedDB.databases() is a defensive extra check
// so that a cleared localStorage flag can never cause a real local database
// to get seeded over (that check itself isn't supported everywhere, which
// is fine — it only ever makes seeding more conservative, never less).
async function hasExistingLocalDatabase(): Promise<boolean> {
  try {
    if (!("databases" in indexedDB)) return false;
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === PGLITE_IDB_NAME);
  } catch {
    return false;
  }
}

// PGlite refuses to loadDataDir into a database that already has data —
// it throws "Database already exists, cannot load from tarball" if
// PG_VERSION is already present on the target filesystem. Closing our own
// connection doesn't erase the underlying IndexedDB store, so "Open
// project" has to delete it explicitly first. onblocked (another tab still
// holding a connection open) doesn't mean the delete failed — it just
// means it's waiting for that connection to close, which may still happen;
// only give up and surface an actionable error after a real timeout.
function deleteIndexedDbDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const req = indexedDB.deleteDatabase(name);
    const timer = setTimeout(() => {
      reject(
        new Error(
          blocked
            ? "Couldn't open project — close other tabs of this app and try again"
            : "Timed out clearing the existing project data",
        ),
      );
    }, 10_000);
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error ?? new Error("Failed to clear the existing project data"));
    };
    req.onblocked = () => {
      blocked = true;
    };
  });
}

function isFirstVisit(): boolean {
  return localStorage.getItem(INIT_FLAG_KEY) !== "1";
}

function markInitialized(): void {
  localStorage.setItem(INIT_FLAG_KEY, "1");
}

async function createInitialClient(): Promise<PGlite> {
  if (!isFirstVisit() || (await hasExistingLocalDatabase())) {
    markInitialized();
    return createClient();
  }
  try {
    const res = await fetch("/localdb/seed.tar.gz", { cache: "no-store" });
    if (!res.ok) throw new Error(`Seed fetch failed: ${res.status}`);
    const seed = await res.blob();
    return await createClient(seed);
  } catch (err) {
    console.error("Failed to load seed data — starting with an empty database instead.", err);
    return createClient();
  } finally {
    markInitialized();
  }
}

export function getDb(): Promise<PGlite> {
  if (!dbPromise) dbPromise = createInitialClient();
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
  // Null it out before the delete, not after — if deleteIndexedDbDatabase
  // throws below, dbPromise must not be left pointing at the connection we
  // just closed (every subsequent getDb() would hand out a dead client).
  dbPromise = null;
  await deleteIndexedDbDatabase(PGLITE_IDB_NAME);
  markInitialized();
  dbPromise = createClient(file);
  await dbPromise;
}

export function newId(): string {
  return crypto.randomUUID();
}
