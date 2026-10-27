"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PLAYTIME_TIERS } from "@/lib/playtimeTiers";
import { SORT_OPTIONS, type ReviewSearchParams } from "@/lib/localDb/queries/reviewFilters";

export type { ReviewSearchParams };

export const FILTER_KEYS = [
  "voted",
  "purchase",
  "earlyAccess",
  "playtime",
  "playtimeAtReview",
  "language",
  "from",
  "to",
  "minVotes",
  "minLength",
] as const;

const DEBOUNCE_MS = 400;

// Shared between the single-game Reviews page and the project-wide mixed
// view — identical filter fields in both places, applied per-game before
// interleaving in the mixed view.
//
// Collapsed behind <details> by default — 9 fields were rendering fully
// expanded above the review list on every visit, pushing actual content
// below the fold even when nothing was filtered. Opens automatically when a
// filter from a previous visit is already active, so it's never hiding
// state the researcher needs to see.
//
// Filters apply on change instead of requiring an explicit "Apply filters"
// click — this is pure client-side PGlite SQL with no server round-trip, so
// there's no latency reason for that extra step. Selects/early-access submit
// immediately; the four free-text/date fields debounce briefly so typing
// doesn't fire a navigation per keystroke. Matches the existing GET-form
// behavior exactly: a fresh query string built from just the filter fields
// (+ sort), dropping page/codebookId, same as the old native submit did.
export function ReviewFilterForm({
  sp,
  languages,
  clearHref,
}: {
  sp: ReviewSearchParams;
  languages: { language: string; count: number }[];
  clearHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [fields, setFields] = useState<ReviewSearchParams>(sp);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spKey = JSON.stringify(sp);

  // Stay in sync when navigation happens from elsewhere (e.g. a chip's "✕").
  useEffect(() => {
    setFields(sp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey]);

  function navigate(next: ReviewSearchParams) {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      if (next[k]) params.set(k, next[k]!);
    }
    if (next.sort) params.set("sort", next.sort);
    router.push(`${pathname}?${params.toString()}`);
  }

  function updateImmediate(key: keyof ReviewSearchParams, value: string) {
    const next = { ...fields, [key]: value || undefined };
    setFields(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate(next);
  }

  function updateDebounced(key: keyof ReviewSearchParams, value: string) {
    const next = { ...fields, [key]: value || undefined };
    setFields(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  const activeCount = FILTER_KEYS.filter((k) => sp[k]).length;

  return (
    <details open={activeCount > 0} className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm text-sm">
      <summary className="cursor-pointer select-none p-4 font-medium">
        Filters{activeCount > 0 ? ` (${activeCount} active)` : ""}
      </summary>
      <div className="grid grid-cols-2 gap-4 border-t border-gray-100 p-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Recommended</span>
          <select
            value={fields.voted ?? ""}
            onChange={(e) => updateImmediate("voted", e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">All</option>
            <option value="up">Recommended</option>
            <option value="down">Not recommended</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Purchase</span>
          <select
            value={fields.purchase ?? ""}
            onChange={(e) => updateImmediate("purchase", e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">All</option>
            <option value="verified">Verified purchase only</option>
            <option value="free">Received for free only</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Early access</span>
          <select
            value={fields.earlyAccess ?? ""}
            onChange={(e) => updateImmediate("earlyAccess", e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">All</option>
            <option value="true">Written during EA only</option>
          </select>
        </label>

        <div className="col-span-2 sm:col-span-4" />

        <label className="flex flex-col gap-1">
          <span className="font-medium">Playtime (overall)</span>
          <select
            value={fields.playtime ?? ""}
            onChange={(e) => updateImmediate("playtime", e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">All</option>
            {PLAYTIME_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Playtime (at review)</span>
          <select
            value={fields.playtimeAtReview ?? ""}
            onChange={(e) => updateImmediate("playtimeAtReview", e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">All</option>
            {PLAYTIME_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Language</span>
          <select
            value={fields.language ?? ""}
            onChange={(e) => updateImmediate("language", e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">All</option>
            {languages.map((l) => (
              <option key={l.language} value={l.language}>
                {l.language} ({l.count})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">From</span>
          <input
            type="date"
            value={fields.from ?? ""}
            onChange={(e) => updateDebounced("from", e.target.value)}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">To</span>
          <input
            type="date"
            value={fields.to ?? ""}
            onChange={(e) => updateDebounced("to", e.target.value)}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Sort by</span>
          <select
            value={fields.sort ?? "newest"}
            onChange={(e) => updateImmediate("sort", e.target.value)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Min. helpful votes</span>
          <input
            type="number"
            min={0}
            value={fields.minVotes ?? ""}
            onChange={(e) => updateDebounced("minVotes", e.target.value)}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium">Min. length (chars)</span>
          <input
            type="number"
            min={0}
            value={fields.minLength ?? ""}
            onChange={(e) => updateDebounced("minLength", e.target.value)}
            className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
          <a href={clearHref} className="rounded border border-gray-300 px-4 py-1.5">
            Clear
          </a>
        </div>
      </div>
    </details>
  );
}
