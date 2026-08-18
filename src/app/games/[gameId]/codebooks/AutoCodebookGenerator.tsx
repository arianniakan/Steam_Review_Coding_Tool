"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { COLOR_PRESETS } from "./[codebookId]/CodeManager";
import { PLAYTIME_TIERS } from "@/lib/playtimeTiers";
import { ReviewPicker } from "./ReviewPicker";
import { sampleReviewsForCodebook } from "@/lib/localDb/queries/reviews";
import { createCodebookWithCodes } from "@/lib/localDb/queries/codebooks";

const MIN_SAMPLE_SIZE = 10;
const MAX_SAMPLE_SIZE = 100;
const MIN_REVIEW_TEXT_LENGTH = 20; // skip one-word noise like "gud" / "s"

interface Proposal {
  label: string;
  description: string;
  color: string;
  selected: boolean;
}

interface CriteriaFilters {
  voted: string;
  playtime: string;
  earlyAccess: string;
  purchase: string;
  language: string;
  from: string;
  to: string;
  minVotes: string;
  minLength: string;
}

const EMPTY_FILTERS: CriteriaFilters = {
  voted: "",
  playtime: "",
  earlyAccess: "",
  purchase: "",
  language: "",
  from: "",
  to: "",
  minVotes: "",
  minLength: "",
};

const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof CriteriaFilters)[];

interface SavedSample {
  id: string;
  name: string;
  query: string;
}

export function AutoCodebookGenerator({
  gameId,
  gameName,
  languages,
  savedSamples,
}: {
  gameId: string;
  gameName: string;
  languages: { language: string; count: number }[];
  savedSamples: SavedSample[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const [mode, setMode] = useState<"auto" | "handpick">("auto");
  const [sampleSize, setSampleSize] = useState(40);
  const [ratio, setRatio] = useState(50);
  const [sampleMode, setSampleMode] = useState<"helpful" | "random">("helpful");
  const [targetCount, setTargetCount] = useState(8);
  const [filters, setFilters] = useState<CriteriaFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [usedSampleSize, setUsedSampleSize] = useState(0);
  const [codebookName, setCodebookName] = useState("");
  const [creating, setCreating] = useState(false);

  function updateFilter(patch: Partial<CriteriaFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function loadSavedSample(query: string) {
    if (!query) return;
    const params = new URLSearchParams(query);
    const next = { ...EMPTY_FILTERS };
    for (const key of FILTER_KEYS) {
      next[key] = params.get(key) ?? "";
    }
    setFilters(next);
    toast.success("Loaded criteria from saved sample");
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setProposals(null);
    try {
      const clampedSampleSize = Math.min(Math.max(sampleSize, MIN_SAMPLE_SIZE), MAX_SAMPLE_SIZE);
      const reviewTexts = await sampleReviewsForCodebook({
        gameId,
        filters:
          mode === "handpick"
            ? {}
            : Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")),
        reviewIds: mode === "handpick" ? [...selectedIds] : [],
        sampleSize: clampedSampleSize,
        ratio,
        sampleMode,
        maxSampleSize: MAX_SAMPLE_SIZE,
        minReviewTextLength: MIN_REVIEW_TEXT_LENGTH,
      });

      const res = await fetch(`/api/games/${gameId}/suggest-codebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewTexts, gameName, focus: focus || undefined, targetCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate codebook");
      setProposals(
        data.proposals.map((p: { label: string; description: string }, i: number) => ({
          ...p,
          color: COLOR_PRESETS[i % COLOR_PRESETS.length],
          selected: true,
        })),
      );
      setUsedSampleSize(data.sampleSize);
      setCodebookName(focus ? `AI draft — ${focus.slice(0, 40)}` : "AI draft codebook");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  function updateProposal(i: number, patch: Partial<Proposal>) {
    setProposals((prev) => prev?.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) ?? null);
  }

  async function handleCreate() {
    if (!proposals) return;
    const selected = proposals.filter((p) => p.selected);
    if (selected.length === 0) {
      setError("Select at least one code to create");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createCodebookWithCodes(
        gameId,
        codebookName,
        selected.map(({ label, description, color }) => ({ label, description, color })),
      );
      toast.success(`Created "${created.name}" with ${selected.length} code(s)`);
      setOpen(false);
      setProposals(null);
      router.push(`/games/${gameId}/codebooks/${created.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg border border-gray-300 px-4 py-1.5 text-sm hover:border-gray-400"
      >
        ✨ Auto-generate a codebook from reviews
      </button>
    );
  }

  const canSubmit = mode === "auto" || selectedIds.size > 0;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium">Auto-generate a codebook</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setProposals(null);
          }}
          className="text-xs underline"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        The AI reads a sample of real reviews and proposes a starting codebook. Nothing is
        created until you review and select codes.
      </p>

      {!proposals && (
        <form onSubmit={handleGenerate} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Research focus (optional)</span>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              placeholder="e.g. difficulty and accessibility complaints"
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>

          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={mode === "auto"}
                onChange={() => setMode("auto")}
              />
              Automatic sampling
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={mode === "handpick"}
                onChange={() => setMode("handpick")}
              />
              Hand-pick specific reviews
            </label>
          </div>

          <div className="rounded border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">
                {mode === "auto"
                  ? "Which reviews should the AI look at?"
                  : "Search filters for hand-picking reviews"}
              </p>
              {savedSamples.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => loadSavedSample(e.target.value)}
                  className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                >
                  <option value="" disabled>
                    Load from saved sample…
                  </option>
                  {savedSamples.map((s) => (
                    <option key={s.id} value={s.query}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span>Recommended</span>
                <select
                  value={filters.voted}
                  onChange={(e) => updateFilter({ voted: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">All (balanced sample)</option>
                  <option value="up">Recommended only</option>
                  <option value="down">Not recommended only</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span>Playtime</span>
                <select
                  value={filters.playtime}
                  onChange={(e) => updateFilter({ playtime: e.target.value })}
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
                <span>Early access</span>
                <select
                  value={filters.earlyAccess}
                  onChange={(e) => updateFilter({ earlyAccess: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">All</option>
                  <option value="true">Written during EA only</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span>Purchase</span>
                <select
                  value={filters.purchase}
                  onChange={(e) => updateFilter({ purchase: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">All</option>
                  <option value="verified">Verified purchase only</option>
                  <option value="free">Received for free only</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span>Language</span>
                <select
                  value={filters.language}
                  onChange={(e) => updateFilter({ language: e.target.value })}
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
                <span>Min. helpful votes</span>
                <input
                  type="number"
                  min={0}
                  value={filters.minVotes}
                  onChange={(e) => updateFilter({ minVotes: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span>Min. length (chars)</span>
                <input
                  type="number"
                  min={0}
                  value={filters.minLength}
                  onChange={(e) => updateFilter({ minLength: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span>From</span>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => updateFilter({ from: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span>To</span>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => updateFilter({ to: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1"
                />
              </label>
            </div>

            {mode === "auto" && filters.voted === "" && (
              <label className="mt-3 flex flex-col gap-1 text-xs">
                <span>
                  % Recommended in sample (rest is not-recommended) — {ratio}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={ratio}
                  onChange={(e) => setRatio(Number(e.target.value))}
                />
              </label>
            )}
          </div>

          {mode === "handpick" && (
            <ReviewPicker
              gameId={gameId}
              filters={filters}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
            />
          )}

          <div className="flex gap-3">
            {mode === "auto" && (
              <label className="flex flex-1 flex-col gap-1">
                <span className="font-medium">Sample size</span>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={sampleSize}
                  onChange={(e) => setSampleSize(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-1"
                />
              </label>
            )}
            {mode === "auto" && (
              <label className="flex flex-1 flex-col gap-1">
                <span className="font-medium">Sample by</span>
                <select
                  value={sampleMode}
                  onChange={(e) => setSampleMode(e.target.value as "helpful" | "random")}
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="helpful">Most helpful (Steam score)</option>
                  <option value="random">Random</option>
                </select>
              </label>
            )}
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-medium">Target # of codes</span>
              <input
                type="number"
                min={3}
                max={20}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={generating || !canSubmit}
            className="self-start rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
          >
            {generating
              ? "Reading reviews…"
              : mode === "handpick"
                ? `Generate proposals from ${selectedIds.size} selected review(s)`
                : "Generate proposals"}
          </button>
          {error && <p className="text-red-600">{error}</p>}
        </form>
      )}

      {proposals && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-gray-500">
            Generated from {usedSampleSize} review(s). Uncheck anything that doesn't look
            right, edit labels/descriptions inline, then create the codebook.
          </p>

          <label className="flex flex-col gap-1">
            <span className="font-medium">Codebook name</span>
            <input
              required
              value={codebookName}
              onChange={(e) => setCodebookName(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>

          <ul className="flex flex-col gap-2">
            {proposals.map((p, i) => (
              <li key={i} className="rounded border border-gray-200 p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={p.selected}
                    onChange={(e) => updateProposal(i, { selected: e.target.checked })}
                    className="mt-1.5"
                  />
                  <span
                    aria-hidden
                    className="mt-2 h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <div className="flex-1">
                    <input
                      value={p.label}
                      onChange={(e) => updateProposal(i, { label: e.target.value })}
                      className="w-full rounded border border-gray-300 px-2 py-1 font-medium"
                    />
                    <textarea
                      value={p.description}
                      onChange={(e) => updateProposal(i, { description: e.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-gray-600"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="self-start rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
            >
              {creating
                ? "Creating…"
                : `Create codebook with ${proposals.filter((p) => p.selected).length} code(s)`}
            </button>
            <button type="button" onClick={() => setProposals(null)} className="text-xs underline">
              ← Back to generate again
            </button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
