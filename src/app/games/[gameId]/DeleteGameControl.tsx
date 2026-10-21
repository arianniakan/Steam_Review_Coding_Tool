"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteGame, type Game } from "@/lib/localDb/queries/games";

// Deleting a game cascades through every review, codebook, tagging, and
// training under it with no undo — the app's usual single-click-then-
// inline-confirm pattern (used for e.g. locking a training, resetting a
// prompt) isn't enough friction for a blast radius this size, so this
// requires typing the exact game name before the button even enables.
export function DeleteGameControl({
  game,
  reviewCount,
  codebookCount,
}: {
  game: Game;
  reviewCount: number;
  codebookCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteGame(game.id);
      toast.success(`Deleted "${game.name}"`);
      router.push("/games");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete game");
      setDeleting(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
      <h2 className="font-medium text-red-900">Danger zone</h2>
      {!confirming ? (
        <>
          <p className="mt-1 text-xs text-red-800">
            Permanently delete this game, its {reviewCount} review{reviewCount === 1 ? "" : "s"}, and{" "}
            {codebookCount} codebook{codebookCount === 1 ? "" : "s"} (with every tagging and
            training under them). This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-1.5 text-sm text-red-700 hover:bg-red-100"
          >
            Delete this game →
          </button>
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-red-800">
            Type <span className="font-mono font-semibold">{game.name}</span> to confirm permanent
            deletion.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={game.name}
            className="max-w-sm rounded border border-red-300 px-2 py-1 text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || typed !== game.name}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              disabled={deleting}
              className="text-sm text-red-700 underline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
