"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listGames, type GameWithCounts } from "@/lib/localDb/queries/games";

export default function Home() {
  // A brand-new browser gets a real worked example (Hollow Knight, 200
  // reviews, a codebook) seeded before this ever renders — but the plain
  // text pitch below gave no hint it was there, burying the app's actual
  // payoff (the calibration pipeline, kappa) several undiscoverable clicks
  // deep. Surfacing whatever's already in this browser's local DB, new
  // visitor or returning one, fixes that without special-casing "is this
  // the seed" — there's always something to continue if a game exists.
  const [games, setGames] = useState<GameWithCounts[] | null>(null);

  useEffect(() => {
    listGames().then(setGames);
  }, []);

  const featured = games?.[0];

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">
        Steam Reviews Qualitative Coding Tool
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Ingest Steam reviews, build a codebook, tag review segments, and get
        AI-assisted coding suggestions with measured human-AI agreement.
      </p>

      {featured && (
        <Link
          href={`/games/${featured.id}/reviews`}
          className="mt-6 block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-gray-400"
        >
          <p className="text-sm font-medium">Continue with {featured.name} →</p>
          <p className="mt-1 text-xs text-gray-500">
            {featured.reviewCount} review{featured.reviewCount === 1 ? "" : "s"} ·{" "}
            {featured.codebookCount} codebook{featured.codebookCount === 1 ? "" : "s"} already here
            in this browser — including the full calibrate → test → verify → auto-code pipeline.
          </p>
        </Link>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <Link href="/ingest" className="underline">
          Ingest reviews for a game →
        </Link>
        <Link href="/games" className="underline">
          Browse ingested games →
        </Link>
        <Link href="/projects" className="underline">
          Projects (compare coding across multiple games) →
        </Link>
      </div>
    </main>
  );
}
