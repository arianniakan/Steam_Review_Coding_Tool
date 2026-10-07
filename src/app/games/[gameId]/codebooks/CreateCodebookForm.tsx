"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createCodebook, createCodebookForProject, type Codebook } from "@/lib/localDb/queries/codebooks";

type CreateScope = { type: "game"; gameId: string } | { type: "project"; projectId: string };

export function CreateCodebookForm({
  scope,
  onCreated,
}: {
  scope: CreateScope;
  onCreated: (codebook: Codebook & { codeCount: number }) => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created =
        scope.type === "game" ? await createCodebook(scope.gameId, name) : await createCodebookForProject(scope.projectId, name);
      onCreated({ ...created, codeCount: 0 });
      setName("");
      toast.success(`Created codebook "${created.name}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New codebook name (e.g. Difficulty discourse v1)"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
