"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CreateCodebookForm } from "@/app/games/[gameId]/codebooks/CreateCodebookForm";
import { AutoCodebookGenerator } from "@/app/games/[gameId]/codebooks/AutoCodebookGenerator";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getProjectById, listGamesForProject, type Project } from "@/lib/localDb/queries/projects";
import { listCodebooksForProject, type CodebookWithCodeCount } from "@/lib/localDb/queries/codebooks";
import { groupReviewsByLanguage } from "@/lib/localDb/queries/reviews";
import type { Game } from "@/lib/localDb/queries/games";
import { getTrainingForCodebook, type TrainingPhase } from "@/lib/localDb/queries/training";
import { PageLoading } from "@/components/PageLoading";
import { TrainingPhaseBadge } from "@/components/TrainingPhaseBadge";

export default function ProjectCodebooksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [codebooks, setCodebooks] = useState<CodebookWithCodeCount[]>([]);
  const [languages, setLanguages] = useState<{ language: string; count: number }[]>([]);
  const [phases, setPhases] = useState<Record<string, TrainingPhase | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, gs, cbs] = await Promise.all([
        getProjectById(projectId),
        listGamesForProject(projectId),
        listCodebooksForProject(projectId),
      ]);
      if (cancelled) return;
      setProject(p);
      setGames(gs);
      setCodebooks(cbs);
      if (gs.length > 0) {
        const langs = await groupReviewsByLanguage(gs.map((g) => g.id));
        if (cancelled) return;
        setLanguages(langs);
      }
      const phaseEntries = await Promise.all(
        cbs.map(async (cb) => [cb.id, (await getTrainingForCodebook(cb.id))?.phase ?? null] as const),
      );
      if (cancelled) return;
      setPhases(Object.fromEntries(phaseEntries));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return <PageLoading />;
  }
  if (!project) {
    return (
      <main className="mx-auto max-w-xl p-4 sm:p-8">
        <p className="text-sm text-gray-500">Project not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${projectId}` }]} />
      <div className="mt-2">
        <BackButton href={`/projects/${projectId}`} label={project.name} />
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{project.name} — Codebooks</h1>
      <p className="mt-1 text-sm text-gray-500">
        A project-scoped codebook applies to every game in this project. Version
        by creating a new codebook rather than editing one mid-analysis.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {codebooks.map((cb) => (
          <li key={cb.id}>
            <Link
              href={`/projects/${projectId}/codebooks/${cb.id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-2 text-sm hover:border-gray-400"
            >
              <span>
                {cb.name} <span className="text-xs text-gray-400">v{cb.version}</span>
              </span>
              <span className="flex items-center gap-2">
                <TrainingPhaseBadge phase={phases[cb.id] ?? null} />
                <span className="text-gray-500">
                  {cb.codeCount} code{cb.codeCount === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {codebooks.length === 0 && (
          <li className="text-sm text-gray-500">No codebooks yet.</li>
        )}
      </ul>

      {games.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          Add at least one game to this project before creating a codebook.
        </p>
      ) : (
        <>
          <CreateCodebookForm
            scope={{ type: "project", projectId }}
            onCreated={(cb) => setCodebooks((prev) => [cb, ...prev])}
          />
          <AutoCodebookGenerator
            scope={{ type: "project", projectId, games: games.map((g) => ({ id: g.id, name: g.name })) }}
            languages={languages}
            savedSamples={[]}
          />
        </>
      )}
    </main>
  );
}
