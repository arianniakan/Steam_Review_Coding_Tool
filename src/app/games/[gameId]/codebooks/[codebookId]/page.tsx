"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CodeManager } from "./CodeManager";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { getCodebookById, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";

export default function CodebookDetailPage() {
  const { gameId, codebookId } = useParams<{ gameId: string; codebookId: string }>();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cb = await getCodebookById(codebookId);
      if (cancelled) return;
      if (!cb || cb.gameId !== gameId) {
        setCodebook(null);
        setLoading(false);
        return;
      }
      const [g, cds] = await Promise.all([getGameById(gameId), listCodesForCodebook(codebookId)]);
      if (cancelled) return;
      setGame(g);
      setCodebook(cb);
      setCodes(cds);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, codebookId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!codebook || !game) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p className="text-sm text-gray-500">Codebook not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name, href: `/games/${gameId}/reviews` },
          { label: "Codebooks", href: `/games/${gameId}/codebooks` },
          { label: codebook.name },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/games/${gameId}/codebooks`} label="Codebooks" />
      </div>
      <div className="mt-2">
        <p className="text-sm text-gray-500">{game.name}</p>
        <h1 className="text-2xl font-semibold">{codebook.name}</h1>
      </div>

      <div className="mt-6">
        <CodeManager codebookId={codebookId} codes={codes} />
      </div>
    </main>
  );
}
