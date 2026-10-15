"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { getCodebookById, type Codebook } from "@/lib/localDb/queries/codebooks";
import {
  listDisagreementsForCodebook,
  type DisagreementRow,
} from "@/lib/localDb/queries/rejectedSuggestions";

export default function DisagreementsPage() {
  const { gameId, codebookId } = useParams<{ gameId: string; codebookId: string }>();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [rows, setRows] = useState<DisagreementRow[]>([]);

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
      const [g, rs] = await Promise.all([getGameById(gameId), listDisagreementsForCodebook(codebookId)]);
      if (cancelled) return;
      setGame(g);
      setCodebook(cb);
      setRows(rs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, codebookId]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!codebook || !game) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Codebook not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Breadcrumbs
        items={[
          { label: "Games", href: "/games" },
          { label: game.name, href: `/games/${gameId}/reviews` },
          { label: codebook.name, href: `/games/${gameId}/reviews?codebookId=${codebookId}` },
          { label: "Disagreements" },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/games/${gameId}/reviews?codebookId=${codebookId}`} label="Reviews" />
      </div>
      <div className="mt-2">
        <p className="text-sm text-gray-500">{game.name}</p>
        <h1 className="text-2xl font-semibold">{codebook.name} — Disagreements</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every AI suggestion you&apos;ve rejected — a direct record of where the model&apos;s
          reading diverged from yours. Work through these to refine code descriptions or spot
          patterns in what the model gets wrong.
        </p>
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: r.codeColor }}
              />
              <span className="font-medium text-gray-900">{r.codeLabel}</span>
              <span>· {Math.round(r.aiConfidence * 100)}% confidence</span>
              <span>· rejected {new Date(r.rejectedAt).toISOString().slice(0, 10)}</span>
            </div>
            <p className="mt-2 italic text-gray-600">&ldquo;{r.spanText}&rdquo;</p>
            <p className="mt-1 text-gray-600">{r.aiRationale}</p>
            <Link
              href={`/games/${gameId}/reviews/${r.reviewId}?codebookId=${codebookId}`}
              className="mt-2 inline-block text-xs underline"
            >
              Tag this review →
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-gray-500">
            No rejected suggestions yet — nothing to review here.
          </li>
        )}
      </ul>
    </main>
  );
}
