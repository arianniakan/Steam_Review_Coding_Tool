"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { COLOR_PRESETS } from "./[codebookId]/CodeManager";

interface Proposal {
  label: string;
  description: string;
  color: string;
  selected: boolean;
}

export function AutoCodebookGenerator({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const [sampleSize, setSampleSize] = useState(40);
  const [targetCount, setTargetCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [usedSampleSize, setUsedSampleSize] = useState(0);
  const [codebookName, setCodebookName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setProposals(null);
    try {
      const res = await fetch(`/api/games/${gameId}/suggest-codebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleSize, targetCount, focus: focus || undefined }),
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
      const res = await fetch(`/api/games/${gameId}/codebooks/from-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: codebookName,
          codes: selected.map(({ label, description, color }) => ({ label, description, color })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create codebook");
      toast.success(`Created "${data.name}" with ${selected.length} code(s)`);
      setOpen(false);
      setProposals(null);
      router.push(`/games/${gameId}/codebooks/${data.id}`);
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
        The AI reads a sample of real reviews (split evenly between recommended and
        not-recommended, favoring the most helpful ones) and proposes a starting codebook.
        Nothing is created until you review and select codes below.
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
          <div className="flex gap-3">
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
            disabled={generating}
            className="self-start rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
          >
            {generating ? "Reading reviews…" : "Generate proposals"}
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
