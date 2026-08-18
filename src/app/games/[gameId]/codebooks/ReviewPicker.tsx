"use client";

import { useState } from "react";

interface ReviewRow {
  id: string;
  text: string;
  votedUp: boolean;
  votesUp: number;
  weightedVoteScore: number;
  steamPurchase: boolean;
}

interface FilterValues {
  voted: string;
  playtime: string;
  earlyAccess: string;
  purchase: string;
  language: string;
  from: string;
  to: string;
  minVotes: string;
  minLength: string;
}

export function ReviewPicker({
  gameId,
  filters,
  selectedIds,
  onToggle,
}: {
  gameId: string;
  filters: FilterValues;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [results, setResults] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(nextPage: number) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v !== "") as [string, string][],
      );
      params.set("page", String(nextPage));
      const res = await fetch(`/api/games/${gameId}/reviews?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.reviews);
      setTotal(data.total);
      setPage(nextPage);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(Math.ceil(total / 20), 1);

  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">
          Browse reviews matching the criteria above and check the ones to use
        </p>
        <button
          type="button"
          onClick={() => search(1)}
          disabled={loading}
          className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {searched && (
        <>
          <p className="mt-2 text-xs text-gray-500">
            {total} matching review(s) · {selectedIds.size} selected
          </p>
          <ul className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto">
            {results.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-2 rounded border border-gray-100 p-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => onToggle(r.id)}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-gray-500">
                    <span className={r.votedUp ? "text-green-700" : "text-red-700"}>
                      {r.votedUp ? "Recommended" : "Not recommended"}
                    </span>
                    <span>
                      · {r.votesUp} helpful ({(r.weightedVoteScore * 100).toFixed(0)}%)
                    </span>
                    {r.steamPurchase && <span>· Verified</span>}
                  </div>
                  <p className="mt-1 text-gray-800">
                    {r.text.length > 220 ? r.text.slice(0, 220) + "…" : r.text}
                  </p>
                </div>
              </li>
            ))}
            {results.length === 0 && <li className="text-gray-500">No reviews match.</li>}
          </ul>
          {totalPages > 1 && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => search(page - 1)}
                className="underline disabled:text-gray-300 disabled:no-underline"
              >
                ← Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => search(page + 1)}
                className="underline disabled:text-gray-300 disabled:no-underline"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
