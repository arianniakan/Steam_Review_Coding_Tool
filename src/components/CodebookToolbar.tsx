"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { exportCodebookCsv } from "@/lib/localDb/csvExport";
import { countDisagreementsForCodebook } from "@/lib/localDb/queries/rejectedSuggestions";
import { countIrrelevantReviews } from "@/lib/localDb/queries/reviewRelevance";
import {
  setStoredActiveCodebookId,
  setStoredActiveProjectCodebookId,
} from "@/lib/activeCodebook";

interface CodebookOption {
  id: string;
  name: string;
}

type CodebookScope = { type: "game"; gameId: string } | { type: "project"; projectId: string };

const NEW_CODEBOOK_VALUE = "__new__";

// Shared between the Reviews list and the review-detail page (both the
// single-game and multi-game/project flows) so "which codebook am I working
// in" is one selection carried by URL (?codebookId=) rather than several
// independent dropdowns that can silently disagree.
export function CodebookToolbar({
  scope,
  contextName,
  codebooks,
  activeCodebookId,
}: {
  scope: CodebookScope;
  contextName: string;
  codebooks: CodebookOption[];
  activeCodebookId: string | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [disagreementCount, setDisagreementCount] = useState(0);
  const [excludedCount, setExcludedCount] = useState(0);

  const basePath = scope.type === "game" ? `/games/${scope.gameId}` : `/projects/${scope.projectId}`;
  const noCodebooksLabel = scope.type === "game" ? "this game" : "this project";
  const effectiveActiveId = activeCodebookId ?? codebooks[0]?.id;

  useEffect(() => {
    // No active codebook means codebooks.length === 0, which short-circuits
    // to the "no codebooks yet" return below before this count is ever
    // rendered — nothing to reset.
    if (!effectiveActiveId) return;
    let cancelled = false;
    Promise.all([
      countDisagreementsForCodebook(effectiveActiveId),
      countIrrelevantReviews(effectiveActiveId),
    ]).then(([disagreements, excluded]) => {
      if (cancelled) return;
      setDisagreementCount(disagreements);
      setExcludedCount(excluded);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveActiveId]);

  if (codebooks.length === 0) {
    return (
      <div className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-500">
        <span>No codebooks yet for {noCodebooksLabel}.</span>
        <Link
          href={`${basePath}/codebooks`}
          className="rounded-lg bg-black px-4 py-1.5 text-sm text-white hover:bg-gray-800"
        >
          + New codebook
        </Link>
      </div>
    );
  }

  const active = codebooks.find((cb) => cb.id === activeCodebookId) ?? codebooks[0]!;

  function handleSelectChange(value: string) {
    if (value === NEW_CODEBOOK_VALUE) {
      router.push(`${basePath}/codebooks`);
      return;
    }
    if (scope.type === "game") {
      setStoredActiveCodebookId(scope.gameId, value);
    } else {
      setStoredActiveProjectCodebookId(scope.projectId, value);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("codebookId", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3">
      {/* Selecting and configuring the codebook itself */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">Codebook:</span>
        <select
          value={active.id}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="max-w-full rounded border border-gray-300 px-2 py-1.5"
        >
          {codebooks.map((cb) => (
            <option key={cb.id} value={cb.id}>
              {cb.name}
            </option>
          ))}
          <option value={NEW_CODEBOOK_VALUE}>+ New codebook…</option>
        </select>
        <Link
          href={`${basePath}/codebooks/${active.id}`}
          title="Edit this codebook's codes and AI prompt, or start/continue its Train & Auto-Code pipeline"
          className="text-xs text-gray-500 underline hover:text-gray-900"
        >
          Manage codes
        </Link>
      </div>

      {/* Results for the selected codebook — a distinct group, not more
          options in the same row as the selector above */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-l border-gray-200 pl-4">
        <Link
          href={`${basePath}/codebooks/${active.id}/disagreements`}
          title="Every AI suggestion a human rejected, for examining failure modes"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Disagreements{disagreementCount > 0 ? ` (${disagreementCount})` : ""}
        </Link>
        <Link
          href={`${basePath}/codebooks/${active.id}/excluded`}
          title="Reviews marked not relevant to this codebook — hidden from the normal list, reversible"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Excluded{excludedCount > 0 ? ` (${excludedCount})` : ""}
        </Link>
        <Link
          href={`${basePath}/codebooks/${active.id}/analytics`}
          title="Human/AI agreement (Cohen's kappa), code frequency, and co-occurrence for this codebook"
          className="rounded-lg border border-gray-900 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Analytics
        </Link>
        <button
          type="button"
          onClick={() => exportCodebookCsv(active.id, contextName, active.name)}
          title="Download every tagging for this codebook as a CSV file"
          className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
