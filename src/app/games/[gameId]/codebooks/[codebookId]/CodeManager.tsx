"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CodeRow {
  id: string;
  label: string;
  description: string;
  color: string;
  parentCodeId: string | null;
}

export function CodeManager({
  codebookId,
  codes,
}: {
  codebookId: string;
  codes: CodeRow[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [parentCodeId, setParentCodeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/codebooks/${codebookId}/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          description,
          color,
          parentCodeId: parentCodeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create code");
      setLabel("");
      setDescription("");
      setColor("#6b7280");
      setParentCodeId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(codeId: string) {
    setDeletingId(codeId);
    setError(null);
    try {
      const res = await fetch(`/api/codes/${codeId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete code");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeletingId(null);
    }
  }

  function parentLabel(parentCodeId: string | null) {
    if (!parentCodeId) return null;
    return codes.find((c) => c.id === parentCodeId)?.label ?? null;
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {codes.map((code) => (
          <li
            key={code.id}
            className="flex items-start justify-between gap-3 rounded border border-gray-200 p-3 text-sm"
          >
            <div className="flex gap-2">
              <span
                aria-hidden
                className="mt-1 h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: code.color }}
              />
              <div>
                <p className="font-medium">
                  {code.label}
                  {parentLabel(code.parentCodeId) && (
                    <span className="ml-2 text-xs text-gray-500">
                      under {parentLabel(code.parentCodeId)}
                    </span>
                  )}
                </p>
                <p className="text-gray-600">{code.description}</p>
              </div>
            </div>
            <button
              onClick={() => handleDelete(code.id)}
              disabled={deletingId === code.id}
              className="shrink-0 text-xs text-red-600 underline disabled:opacity-50"
            >
              {deletingId === code.id ? "Deleting…" : "Delete"}
            </button>
          </li>
        ))}
        {codes.length === 0 && (
          <li className="text-sm text-gray-500">No codes yet — add one below.</li>
        )}
      </ul>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded border border-gray-200 p-4 text-sm">
        <p className="font-medium">Add a code</p>
        <label className="flex flex-col gap-1">
          <span>Label</span>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. performance_complaint"
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Description (when should this code apply?)</span>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Reviewer mentions frame rate, stuttering, crashes, or load times as a reason for the score"
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-col gap-1">
            <span>Color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-16 rounded border border-gray-300"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span>Parent code (optional)</span>
            <select
              value={parentCodeId}
              onChange={(e) => setParentCodeId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="">None (top-level)</option>
              {codes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded bg-black px-4 py-1.5 text-white disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add code"}
        </button>
        {error && <p className="text-red-600">{error}</p>}
      </form>
    </div>
  );
}
