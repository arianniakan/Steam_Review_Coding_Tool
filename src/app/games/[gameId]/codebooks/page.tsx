"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CreateCodebookForm } from "./CreateCodebookForm";
import { AutoCodebookGenerator } from "./AutoCodebookGenerator";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { listCodebooksForGame, type CodebookWithCodeCount } from "@/lib/localDb/queries/codebooks";
import { groupReviewsByLanguage } from "@/lib/localDb/queries/reviews";
import { listSavedSamplesForGame, type SavedSample } from "@/lib/localDb/queries/savedSamples";

export default function CodebooksPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [codebooks, setCodebooks] = useState<CodebookWithCodeCount[]>([]);
  const [languages, setLanguages] = useState<{ language: string; count: number }[]>([]);
  const [savedSamples, setSavedSamples] = useState<SavedSample[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [g, cbs, langs, samples] = await Promise.all([
        getGameById(gameId),
        listCodebooksForGame(gameId),
        groupReviewsByLanguage(gameId),
        listSavedSamplesForGame(gameId),
      ]);
      if (cancelled) return;
      setGame(g);
      setCodebooks(cbs);
      setLanguages(langs);
      setSavedSamples(samples);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p className="text-sm text-gray-500">Game not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name, href: `/games/${gameId}/reviews` },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/games/${gameId}/reviews`} label={game.name} />
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{game.name} — Codebooks</h1>
      <p className="mt-1 text-sm text-gray-500">
        A codebook is a named set of codes for tagging review segments. Version
        by creating a new codebook rather than editing one mid-analysis.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {codebooks.map((cb) => (
          <li key={cb.id}>
            <Link
              href={`/games/${gameId}/codebooks/${cb.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-2 text-sm hover:border-gray-400"
            >
              <span>{cb.name}</span>
              <span className="text-gray-500">
                {cb.codeCount} code{cb.codeCount === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
        {codebooks.length === 0 && (
          <li className="text-sm text-gray-500">No codebooks yet.</li>
        )}
      </ul>

      <CreateCodebookForm
        gameId={gameId}
        onCreated={(cb) => setCodebooks((prev) => [cb, ...prev])}
      />
      <AutoCodebookGenerator
        gameId={gameId}
        gameName={game.name}
        languages={languages}
        savedSamples={savedSamples}
      />
    </main>
  );
}
