"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getProjectById, listGamesForProject, type Project } from "@/lib/localDb/queries/projects";
import { getCodebookById, type Codebook } from "@/lib/localDb/queries/codebooks";
import {
  listIrrelevantReviews,
  unmarkReviewIrrelevant,
  type ExcludedReviewRow,
} from "@/lib/localDb/queries/reviewRelevance";

export default function ProjectExcludedReviewsPage() {
  const { projectId, codebookId } = useParams<{ projectId: string; codebookId: string }>();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [rows, setRows] = useState<ExcludedReviewRow[]>([]);
  const [gameNames, setGameNames] = useState<Record<string, string>>({});

  async function load() {
    const cb = await getCodebookById(codebookId);
    if (!cb || cb.projectId !== projectId) {
      setCodebook(null);
      setLoading(false);
      return;
    }
    const [p, games, rs] = await Promise.all([
      getProjectById(projectId),
      listGamesForProject(projectId),
      listIrrelevantReviews(codebookId),
    ]);
    setProject(p);
    setCodebook(cb);
    setRows(rs);
    setGameNames(Object.fromEntries(games.map((g) => [g.id, g.name])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, codebookId]);

  async function handleUnmark(reviewId: string) {
    await unmarkReviewIrrelevant(reviewId, codebookId);
    setRows((prev) => prev.filter((r) => r.reviewId !== reviewId));
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!codebook || !project) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-gray-500">Codebook not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: codebook.name, href: `/projects/${projectId}/reviews?codebookId=${codebookId}` },
          { label: "Excluded" },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/projects/${projectId}/reviews?codebookId=${codebookId}`} label="Reviews" />
      </div>
      <div className="mt-2">
        <p className="text-sm text-gray-500">{project.name}</p>
        <h1 className="text-2xl font-semibold">{codebook.name} — Excluded reviews</h1>
        <p className="mt-1 text-sm text-gray-500">
          Reviews marked not relevant to this codebook&apos;s research question, across every game
          in this project — hidden from the normal Reviews list and never drawn into a training
          split for this codebook. Un-mark to bring one back.
        </p>
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                {gameNames[r.reviewGameId] ?? "Unknown game"}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-gray-600">{r.reviewText}</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                excluded {new Date(r.excludedAt).toISOString().slice(0, 10)}
              </span>
              <div className="flex shrink-0 items-center gap-3">
                <Link
                  href={`/projects/${projectId}/reviews/${r.reviewId}?codebookId=${codebookId}`}
                  className="text-xs underline"
                >
                  View →
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnmark(r.reviewId)}
                  className="text-xs underline"
                >
                  Un-mark
                </button>
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-gray-500">Nothing excluded yet.</li>
        )}
      </ul>
    </main>
  );
}
