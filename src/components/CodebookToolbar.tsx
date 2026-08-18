"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { exportCodebookCsv } from "@/lib/localDb/csvExport";
import { setStoredActiveCodebookId } from "@/lib/activeCodebook";

interface CodebookOption {
  id: string;
  name: string;
}

const NEW_CODEBOOK_VALUE = "__new__";

// Shared between the Reviews list and the review-detail page so "which
// codebook am I working in" is one selection carried by URL (?codebookId=)
// rather than two independent dropdowns that can silently disagree.
export function CodebookToolbar({
  gameId,
  gameName,
  codebooks,
  activeCodebookId,
}: {
  gameId: string;
  gameName: string;
  codebooks: CodebookOption[];
  activeCodebookId: string | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (codebooks.length === 0) {
    return (
      <div className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-500">
        <span>No codebooks yet for this game.</span>
        <Link
          href={`/games/${gameId}/codebooks`}
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
      router.push(`/games/${gameId}/codebooks`);
      return;
    }
    setStoredActiveCodebookId(gameId, value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("codebookId", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3">
      {/* Selecting and configuring the codebook itself */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Codebook:</span>
        <select
          value={active.id}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5"
        >
          {codebooks.map((cb) => (
            <option key={cb.id} value={cb.id}>
              {cb.name}
            </option>
          ))}
          <option value={NEW_CODEBOOK_VALUE}>+ New codebook…</option>
        </select>
        <Link
          href={`/games/${gameId}/codebooks/${active.id}`}
          className="text-xs text-gray-500 underline hover:text-gray-900"
        >
          Manage codes
        </Link>
      </div>

      {/* Results for the selected codebook — a distinct group, not more
          options in the same row as the selector above */}
      <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
        <Link
          href={`/games/${gameId}/codebooks/${active.id}/analytics`}
          className="rounded-lg border border-gray-900 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Analytics
        </Link>
        <button
          type="button"
          onClick={() => exportCodebookCsv(active.id, gameName, active.name)}
          className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
