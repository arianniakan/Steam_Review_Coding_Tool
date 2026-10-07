"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { CodebookToolbar } from "@/components/CodebookToolbar";
import { resolveActiveProjectCodebookId } from "@/lib/activeCodebook";
import {
  getProjectById,
  listGamesForProject,
  listGamesNotInProject,
  addGameToProject,
  removeGameFromProject,
  type Project,
} from "@/lib/localDb/queries/projects";
import { listCodebooksForProject, type Codebook } from "@/lib/localDb/queries/codebooks";
import type { Game } from "@/lib/localDb/queries/games";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [candidates, setCandidates] = useState<Game[]>([]);
  const [codebooks, setCodebooks] = useState<Codebook[]>([]);
  const [activeCodebookId, setActiveCodebookId] = useState<string | undefined>(undefined);
  const [addGameId, setAddGameId] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [p, gs, cand, cbs] = await Promise.all([
      getProjectById(projectId),
      listGamesForProject(projectId),
      listGamesNotInProject(projectId),
      listCodebooksForProject(projectId),
    ]);
    setProject(p);
    setGames(gs);
    setCandidates(cand);
    setCodebooks(cbs);
    setActiveCodebookId(resolveActiveProjectCodebookId(projectId, cbs, searchParams.get("codebookId")));
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAddGame(e: React.FormEvent) {
    e.preventDefault();
    if (!addGameId) return;
    setBusy(true);
    try {
      await addGameToProject(projectId, addGameId);
      setAddGameId("");
      await refresh();
      toast.success("Game added to project");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveGame(gameId: string) {
    setBusy(true);
    try {
      await removeGameFromProject(projectId, gameId);
      await refresh();
      toast.success("Game removed from project");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }
  if (!project) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">Project not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: project.name }]} />
      <div className="mt-2">
        <BackButton href="/projects" label="Projects" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        {games.length > 0 && (
          <Link href={`/projects/${projectId}/reviews`} className="text-sm underline">
            Mixed reviews view →
          </Link>
        )}
      </div>

      <CodebookToolbar
        scope={{ type: "project", projectId }}
        contextName={project.name}
        codebooks={codebooks}
        activeCodebookId={activeCodebookId}
      />

      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">Games in this project</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {games.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm"
            >
              <Link href={`/games/${g.id}/reviews`} className="flex-1 underline">
                {g.name}
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRemoveGame(g.id)}
                className="text-xs text-red-600 underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
          {games.length === 0 && (
            <li className="text-sm text-gray-500">No games in this project yet.</li>
          )}
        </ul>

        {candidates.length > 0 ? (
          <form onSubmit={handleAddGame} className="mt-4 flex gap-2">
            <select
              value={addGameId}
              onChange={(e) => setAddGameId(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Add a game…</option>
              {candidates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !addGameId}
              className="rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : (
          <p className="mt-4 text-xs text-gray-500">
            Every ingested game is already in this project.{" "}
            <Link href="/ingest" className="underline">
              Ingest another one →
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
