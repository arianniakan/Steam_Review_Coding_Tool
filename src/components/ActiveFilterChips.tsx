"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { PLAYTIME_TIERS } from "@/lib/playtimeTiers";
import { FILTER_KEYS, type ReviewSearchParams } from "./ReviewFilterForm";

// A collapsed filter panel only ever showed "(N active)" — a researcher had
// to open it to see *which* fields were filtering their view. These chips
// surface that at a glance, each with a one-click "✕" to clear just that
// field (matching the existing GET-navigation pattern: a fresh query string
// built from the remaining filter fields + sort, same as the filter form's
// own submit already does — page/codebookId are intentionally dropped,
// exactly like every existing filter-apply/clear action on this page).
function labelFor(key: (typeof FILTER_KEYS)[number], sp: ReviewSearchParams): string {
  switch (key) {
    case "voted":
      return sp.voted === "up" ? "Recommended" : "Not recommended";
    case "purchase":
      return sp.purchase === "verified" ? "Verified purchase only" : "Received for free only";
    case "earlyAccess":
      return "Early access only";
    case "playtime": {
      const tier = PLAYTIME_TIERS.find((t) => t.value === sp.playtime);
      return tier ? tier.label : `Playtime: ${sp.playtime}`;
    }
    case "language":
      return `Language: ${sp.language}`;
    case "from":
      return `From ${sp.from}`;
    case "to":
      return `To ${sp.to}`;
    case "minVotes":
      return `Min ${sp.minVotes} helpful votes`;
    case "minLength":
      return `Min ${sp.minLength} chars`;
  }
}

export function ActiveFilterChips({ sp }: { sp: ReviewSearchParams }) {
  const pathname = usePathname();
  const active = FILTER_KEYS.filter((k) => sp[k]);
  if (active.length === 0) return null;

  function hrefWithout(keyToRemove: (typeof FILTER_KEYS)[number]) {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      if (k !== keyToRemove && sp[k]) params.set(k, sp[k]!);
    }
    if (sp.sort) params.set("sort", sp.sort);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {active.map((k) => (
        <Link
          key={k}
          href={hrefWithout(k)}
          className="flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-gray-400"
        >
          {labelFor(k, sp)}
          <span aria-hidden className="text-gray-400">
            ✕
          </span>
        </Link>
      ))}
    </div>
  );
}
