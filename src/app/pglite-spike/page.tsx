"use client";

import { useEffect, useState } from "react";

// Throwaway spike page — verifies PGlite + idb:// persistence actually
// works in this project's Next.js/Turbopack setup before building anything
// on top of it. Delete once the local-first migration is underway.

interface SpikeRow {
  id: number;
  note: string;
}

export default function PGliteSpikePage() {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SpikeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Work around a browser-cache disk-write quirk seen in some sandboxed
        // environments (ERR_CACHE_WRITE_FAILURE) by forcing PGlite's asset
        // fetches to skip the HTTP cache entirely.
        const originalFetch = window.fetch;
        window.fetch = (input, init) =>
          originalFetch(input, { ...init, cache: "no-store" });

        const { PGlite } = await import("@electric-sql/pglite");
        const db = new PGlite("idb://spike-test");
        window.fetch = originalFetch;
        await db.exec(
          `CREATE TABLE IF NOT EXISTS spike (id serial primary key, note text)`,
        );
        await db.query(`INSERT INTO spike (note) VALUES ($1)`, [
          `loaded at ${new Date().toISOString()}`,
        ]);
        const result = await db.query<SpikeRow>(`SELECT id, note FROM spike ORDER BY id`);
        if (!cancelled) {
          setRows(result.rows);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 32, fontFamily: "monospace" }}>
      <h1>PGlite spike</h1>
      <p>status: {status}</p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <p>row count: {rows.length} (should grow by 1 on every reload if persistence works)</p>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            {r.id}: {r.note}
          </li>
        ))}
      </ul>
    </main>
  );
}
