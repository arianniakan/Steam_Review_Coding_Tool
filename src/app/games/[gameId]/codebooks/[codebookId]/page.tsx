"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CodeManager } from "./CodeManager";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import {
  getCodebookById,
  reviseCodebook,
  getNextVersionCodebook,
  type Codebook,
} from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { getTrainingForCodebook } from "@/lib/localDb/queries/training";

export default function CodebookDetailPage() {
  const { gameId, codebookId } = useParams<{ gameId: string; codebookId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [nextVersion, setNextVersion] = useState<Codebook | null>(null);
  const [trainingPhase, setTrainingPhase] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);

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
      const [g, cds, next, training] = await Promise.all([
        getGameById(gameId),
        listCodesForCodebook(codebookId),
        getNextVersionCodebook(codebookId),
        getTrainingForCodebook(codebookId),
      ]);
      if (cancelled) return;
      setGame(g);
      setCodebook(cb);
      setCodes(cds);
      setNextVersion(next);
      setTrainingPhase(training?.phase ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, codebookId]);

  async function handleRevise() {
    setRevising(true);
    try {
      const created = await reviseCodebook(codebookId);
      toast.success(`Created "${created.name}" v${created.version}`);
      router.push(`/games/${gameId}/codebooks/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRevising(false);
    }
  }

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
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{game.name}</p>
          <h1 className="text-2xl font-semibold">
            {codebook.name} <span className="text-base font-normal text-gray-400">v{codebook.version}</span>
          </h1>
          {codebook.previousVersionId && (
            <Link
              href={`/games/${gameId}/codebooks/${codebook.previousVersionId}`}
              className="text-xs text-gray-500 underline"
            >
              ↩ Revised from v{codebook.version - 1}
            </Link>
          )}
        </div>
        {nextVersion ? (
          <Link
            href={`/games/${gameId}/codebooks/${nextVersion.id}`}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            A newer version (v{nextVersion.version}) exists →
          </Link>
        ) : trainingPhase === "verified" ? (
          <span className="shrink-0 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-800">
            Verified ✓
          </span>
        ) : trainingPhase === "locked" ? (
          <span className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
            Locked for validation
          </span>
        ) : (
          <button
            type="button"
            onClick={handleRevise}
            disabled={revising}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {revising ? "Revising…" : "Revise this codebook →"}
          </button>
        )}
      </div>

      <div className="mt-4">
        <Link
          href={`/games/${gameId}/codebooks/${codebookId}/training`}
          className="inline-block rounded-lg border border-gray-900 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Training (blind calibrate → test → verify → auto-code) →
        </Link>
      </div>

      <div className="mt-6">
        <CodeManager
          codebookId={codebookId}
          codes={codes}
          locked={trainingPhase === "locked" || trainingPhase === "verified"}
        />
      </div>
    </main>
  );
}
