"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { PageLoading } from "@/components/PageLoading";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { countReviews } from "@/lib/localDb/queries/reviews";
import { listCodebooksForGame } from "@/lib/localDb/queries/codebooks";
import { SyncReviewsPanel } from "./SyncReviewsPanel";
import { DeleteGameControl } from "./DeleteGameControl";

export default function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [codebookCount, setCodebookCount] = useState(0);

  async function load() {
    const g = await getGameById(gameId);
    setGame(g);
    if (g) {
      const [rc, cbs] = await Promise.all([countReviews(gameId, {}), listCodebooksForGame(gameId)]);
      setReviewCount(rc);
      setCodebookCount(cbs.length);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (loading) {
    return <PageLoading />;
  }
  if (!game) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-8">
        <p className="text-sm text-gray-500">Game not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <Breadcrumbs items={[{ label: "Games", href: "/games" }, { label: game.name }]} />
      <div className="mt-2">
        <BackButton href="/games" label="Games" />
      </div>

      <div className="mt-2 flex gap-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        {game.headerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.headerImage}
            alt={game.name}
            className="h-24 w-auto shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{game.name}</h1>
          <p className="mt-1 text-xs text-gray-500">Steam App ID {game.steamAppId}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
        <span>
          <span className="font-medium">{reviewCount}</span> review{reviewCount === 1 ? "" : "s"}
        </span>
        <span>
          <span className="font-medium">{codebookCount}</span> codebook{codebookCount === 1 ? "" : "s"}
        </span>
        <span className="text-gray-500">
          {game.lastIngestedAt
            ? `Last synced: ${new Date(game.lastIngestedAt).toLocaleString()} (${game.lastSyncReviewCount ?? "?"} reviews fetched)`
            : "Never re-synced since initial ingest"}
        </span>
      </div>

      <div className="mt-4 flex gap-3">
        <Link
          href={`/games/${gameId}/reviews`}
          className="rounded-lg border border-gray-900 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          View reviews →
        </Link>
        <Link
          href={`/games/${gameId}/codebooks`}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          View codebooks →
        </Link>
      </div>

      <SyncReviewsPanel game={game} onSynced={setGame} />

      <DeleteGameControl game={game} reviewCount={reviewCount} codebookCount={codebookCount} />
    </main>
  );
}
