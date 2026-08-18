import { getDb, resetDbFromFile } from "./client";

// "Save project" / "Open project" — wraps PGlite's built-in dumpDataDir /
// loadDataDir, which serialize the entire local database (every game,
// review, codebook, code, tagging) to a single portable file and back.
// This is the same mechanism a fresh visitor's browser could be bootstrapped
// from, just triggered manually and downloadable/shareable by the
// researcher instead of being baked into the app as a static asset.

export async function exportProject(filename = "steam-review-project"): Promise<void> {
  const db = await getDb();
  const dump = await db.dumpDataDir("gzip");
  const url = URL.createObjectURL(dump);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.tar.gz`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProject(file: File): Promise<void> {
  await resetDbFromFile(file);
}
