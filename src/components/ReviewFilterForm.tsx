import { PLAYTIME_TIERS } from "@/lib/playtimeTiers";
import { SORT_OPTIONS, type ReviewSearchParams } from "@/lib/localDb/queries/reviewFilters";

// Shared between the single-game Reviews page and the project-wide mixed
// view — identical filter fields in both places, applied per-game before
// interleaving in the mixed view. A plain GET form submits back to whatever
// page renders it, so this needs no action/href beyond `clearHref`.
export function ReviewFilterForm({
  sp,
  languages,
  clearHref,
}: {
  sp: ReviewSearchParams;
  languages: { language: string; count: number }[];
  clearHref: string;
}) {
  return (
    <form
      method="get"
      className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm sm:grid-cols-4"
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">Recommended</span>
        <select name="voted" defaultValue={sp.voted ?? ""} className="rounded border border-gray-300 px-2 py-1">
          <option value="">All</option>
          <option value="up">Recommended</option>
          <option value="down">Not recommended</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Purchase</span>
        <select name="purchase" defaultValue={sp.purchase ?? ""} className="rounded border border-gray-300 px-2 py-1">
          <option value="">All</option>
          <option value="verified">Verified purchase only</option>
          <option value="free">Received for free only</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Early access</span>
        <select name="earlyAccess" defaultValue={sp.earlyAccess ?? ""} className="rounded border border-gray-300 px-2 py-1">
          <option value="">All</option>
          <option value="true">Written during EA only</option>
        </select>
      </label>

      <div className="col-span-2 sm:col-span-4" />

      <label className="flex flex-col gap-1">
        <span className="font-medium">Playtime</span>
        <select name="playtime" defaultValue={sp.playtime ?? ""} className="rounded border border-gray-300 px-2 py-1">
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
        <select name="language" defaultValue={sp.language ?? ""} className="rounded border border-gray-300 px-2 py-1">
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
          name="from"
          defaultValue={sp.from ?? ""}
          className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">To</span>
        <input
          type="date"
          name="to"
          defaultValue={sp.to ?? ""}
          className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Sort by</span>
        <select name="sort" defaultValue={sp.sort ?? "newest"} className="rounded border border-gray-300 px-2 py-1">
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
          name="minVotes"
          defaultValue={sp.minVotes ?? ""}
          className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Min. length (chars)</span>
        <input
          type="number"
          min={0}
          name="minLength"
          defaultValue={sp.minLength ?? ""}
          className="w-full min-w-0 rounded border border-gray-300 px-2 py-1"
        />
      </label>

      <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
        <button type="submit" className="rounded-lg bg-black px-4 py-1.5 text-white">
          Apply filters
        </button>
        <a href={clearHref} className="rounded border border-gray-300 px-4 py-1.5">
          Clear
        </a>
      </div>
    </form>
  );
}
