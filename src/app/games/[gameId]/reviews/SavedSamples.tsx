"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createSavedSample, deleteSavedSample } from "@/lib/localDb/queries/savedSamples";

interface SavedSample {
  id: string;
  name: string;
  query: string;
}

export function SavedSamples({
  gameId,
  currentQuery,
  initialSamples,
}: {
  gameId: string;
  currentQuery: string;
  initialSamples: SavedSample[];
}) {
  const [samples, setSamples] = useState(initialSamples);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createSavedSample(gameId, name, currentQuery);
      setSamples((prev) => [created, ...prev]);
      setName("");
      toast.success(`Saved filter preset "${created.name}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id);
    try {
      await deleteSavedSample(id);
      setSamples((prev) => prev.filter((s) => s.id !== id));
      toast.success(`Deleted "${name}"`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white shadow-sm p-3 text-sm">
      <p className="font-medium">Saved samples</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {samples.map((s) => (
          <li key={s.id} className="flex items-center gap-1 rounded-full border border-gray-300 pl-3 pr-1 py-1 text-xs">
            <a href={`?${s.query}`} className="underline">
              {s.name}
            </a>
            <button
              onClick={() => handleDelete(s.id, s.name)}
              disabled={deletingId === s.id}
              className="ml-1 text-red-600 disabled:opacity-50"
              aria-label={`Delete saved sample ${s.name}`}
            >
              ×
            </button>
          </li>
        ))}
        {samples.length === 0 && <li className="text-gray-500">None saved yet.</li>}
      </ul>

      <form onSubmit={handleSave} className="mt-3 flex gap-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this filter combination (e.g. review-bomb week)"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save current filters"}
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
