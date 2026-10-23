"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { getCodebookById, type Codebook } from "@/lib/localDb/queries/codebooks";
import {
  listIrrelevantReviews,
  unmarkReviewIrrelevant,
  type ExcludedReviewRow,
} from "@/lib/localDb/queries/reviewRelevance";
import { PageLoading } from "@/components/PageLoading";

export default function ExcludedReviewsPage() {
  const { gameId, codebookId } = useParams<{ gameId: string; codebookId: string }>();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [rows, setRows] = useState<ExcludedReviewRow[]>([]);

  async function load() {
    const cb = await getCodebookById(codebookId);
    if (!cb || cb.gameId !== gameId) {
      setCodebook(null);
      setLoading(false);
      return;
    }
    const [g, rs] = await Promise.all([getGameById(gameId), listIrrelevantReviews(codebookId)]);
    setGame(g);
    setCodebook(cb);
    setRows(rs);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, codebookId]);

  async function handleUnmark(reviewId: string) {
    await unmarkReviewIrrelevant(reviewId, codebookId);
    setRows((prev) => prev.filter((r) => r.reviewId !== reviewId));
  }

  if (loading) {
    return <PageLoading />;
  }

  if (!codebook || !game) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <p className="text-sm text-gray-500">Codebook not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name, href: `/games/${gameId}/reviews` },
          { label: codebook.name, href: `/games/${gameId}/reviews?codebookId=${codebookId}` },
          { label: "Excluded" },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/games/${gameId}/reviews?codebookId=${codebookId}`} label="Reviews" />
      </div>
      <div className="mt-2">
        <p className="text-sm text-gray-500">{game.name}</p>
        <h1 className="text-2xl font-semibold">{codebook.name} — Excluded reviews</h1>
        <p className="mt-1 text-sm text-gray-500">
          Reviews excluded from this codebook&apos;s research question — hidden from the normal
          Reviews list and never drawn into a training split for this codebook. Re-include to
          bring one back.
        </p>
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
            <p className="whitespace-pre-wrap text-gray-600">{r.reviewText}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                excluded {new Date(r.excludedAt).toISOString().slice(0, 10)}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <Link
                  href={`/games/${gameId}/reviews/${r.reviewId}?codebookId=${codebookId}`}
                  className="text-xs underline"
                >
                  View →
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnmark(r.reviewId)}
                  className="rounded-lg border border-green-300 bg-white px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50"
                >
                  Re-include
                </button>
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-gray-500">Nothing excluded yet.</li>
        )}
      </ul>
    </main>
  );
}
