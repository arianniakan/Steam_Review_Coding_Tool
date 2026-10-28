// Resume point for an in-progress "ingest/sync ALL reviews" run, persisted
// to localStorage so a crashed tab or an explicit cancel doesn't throw away
// hours of fetching — these runs can take a very long time for a game with
// hundreds of thousands of reviews, and PGlite's own writes (which already
// happen per-batch) aren't enough on their own if the tab dies before the
// next batch starts. Keyed by Steam App ID since the same game can be
// resumed from either the generic /ingest page or a game's own sync panel.
const KEY_PREFIX = "steamIngestAllCheckpoint:";

export interface IngestAllCheckpoint {
  steamAppId: number;
  language: string;
  cursor: string;
  pagesPerBatch: number;
  fetchedTotal: number;
  insertedTotal: number;
  updatedTotal: number;
  totalReviewsOnSteam: number;
  updatedAt: string;
}

export function loadIngestCheckpoint(steamAppId: number): IngestAllCheckpoint | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + steamAppId);
    if (!raw) return null;
    return JSON.parse(raw) as IngestAllCheckpoint;
  } catch {
    return null;
  }
}

export function saveIngestCheckpoint(checkpoint: IngestAllCheckpoint): void {
  try {
    localStorage.setItem(KEY_PREFIX + checkpoint.steamAppId, JSON.stringify(checkpoint));
  } catch {
    // Best-effort — a storage quota error or disabled localStorage just
    // means no resume is possible, not a reason to fail the actual ingest.
  }
}

export function clearIngestCheckpoint(steamAppId: number): void {
  try {
    localStorage.removeItem(KEY_PREFIX + steamAppId);
  } catch {
    // ignore
  }
}
