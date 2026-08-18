"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { exportCodebookCsv } from "@/lib/localDb/csvExport";
import { setStoredActiveCodebookId } from "@/lib/activeCodebook";

interface CodebookOption {
  id: string;
  name: string;
}

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
        <Link href={`/games/${gameId}/codebooks`} className="underline">
          Create one →
        </Link>
      </div>
    );
  }

  const active = codebooks.find((cb) => cb.id === activeCodebookId) ?? codebooks[0]!;

  function switchCodebook(id: string) {
    setStoredActiveCodebookId(gameId, id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("codebookId", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Codebook:</span>
        {codebooks.length > 1 ? (
          <select
            value={active.id}
            onChange={(e) => switchCodebook(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {codebooks.map((cb) => (
              <option key={cb.id} value={cb.id}>
                {cb.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-medium">{active.name}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Link href={`/games/${gameId}/codebooks/${active.id}`} className="underline">
          Manage codes
        </Link>
        <Link href={`/games/${gameId}/codebooks/${active.id}/analytics`} className="underline">
          Analytics
        </Link>
        <button
          type="button"
          onClick={() => exportCodebookCsv(active.id, gameName, active.name)}
          className="underline"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
