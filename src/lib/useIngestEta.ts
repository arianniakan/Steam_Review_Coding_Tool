"use client";

import { useEffect, useRef, useState } from "react";

export interface IngestEta {
  remainingSec: number | null; // null while there isn't enough data yet
}

// Estimates time remaining for a long ingest-all/sync-all run from a simple
// average rate (fetched so far / elapsed time since the run started) —
// good enough for a rough "~X remaining" readout without the complexity of
// a moving average. All the impure bits (reading the clock, reading the
// start-time ref) live inside the effect/interval, never in the render
// body itself, so this stays safe under React's stricter render rules.
export function useIngestEta(active: boolean, fetchedCount: number, totalCount: number): IngestEta {
  const startRef = useRef<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      // No setState here — callers already gate the ETA display on
      // `active` themselves, so a stale value just never gets shown.
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();

    function compute() {
      if (startRef.current === null || fetchedCount <= 0 || totalCount <= 0) {
        setRemainingSec(null);
        return;
      }
      const elapsedSec = (Date.now() - startRef.current) / 1000;
      const rate = fetchedCount / elapsedSec;
      if (rate <= 0) {
        setRemainingSec(null);
        return;
      }
      const remainingCount = Math.max(0, totalCount - fetchedCount);
      setRemainingSec(remainingCount / rate);
    }

    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [active, fetchedCount, totalCount]);

  return { remainingSec };
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
