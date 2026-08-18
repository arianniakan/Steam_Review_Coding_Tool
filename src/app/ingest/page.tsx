"use client";

import { useState } from "react";
import { toast } from "sonner";
import { parseSteamAppId } from "@/lib/steam";
import { Breadcrumbs } from "@/components/Breadcrumbs";

interface IngestResult {
  gameId: string;
  gameName: string;
  steamAppId: number;
  fetchedFromSteam: number;
  ingestedCount: number;
  updatedCount: number;
  pagesFetched: number;
  hasMore: boolean;
}

export default function IngestPage() {
  const [appId, setAppId] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedId = parseSteamAppId(appId);
    if (parsedId === null) {
      const message = "Couldn't find a Steam App ID in that — paste a store URL or the numeric ID";
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/games/${parsedId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ingestion failed");
      setResult(data);
      toast.success(`Ingested ${data.ingestedCount} review(s) for ${data.gameName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <Breadcrumbs items={[{ label: "Ingest" }]} />
      <h1 className="mt-2 text-2xl font-semibold">Ingest Steam Reviews</h1>
      <p className="mt-2 text-sm text-gray-500">
        Paste a Steam store URL or just the App ID (e.g.{" "}
        <code>store.steampowered.com/app/1091500</code> or <code>1091500</code>).
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Steam store URL or App ID</span>
          <input
            required
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="store.steampowered.com/app/1091500 or 1091500"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Max pages (100 reviews/page, capped at 30)
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Ingesting…" : "Ingest reviews"}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
          <p className="font-medium">{result.gameName}</p>
          <p className="mt-1 text-gray-600">
            Fetched {result.fetchedFromSteam} reviews from Steam across{" "}
            {result.pagesFetched} page(s); {result.ingestedCount} new,{" "}
            {result.updatedCount} already-ingested row(s) refreshed.
          </p>
          {result.hasMore && (
            <p className="mt-2 text-amber-600">
              Hit the page cap — re-run with a higher max pages (or run again
              later) to pull more.
            </p>
          )}
          <a
            className="mt-3 inline-block underline"
            href={`/games/${result.gameId}/reviews`}
          >
            View reviews →
          </a>
        </div>
      )}
    </main>
  );
}
