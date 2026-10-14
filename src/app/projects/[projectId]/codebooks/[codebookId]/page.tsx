"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CodeManager } from "@/app/games/[gameId]/codebooks/[codebookId]/CodeManager";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getProjectById, type Project } from "@/lib/localDb/queries/projects";
import {
  getCodebookById,
  reviseCodebook,
  getNextVersionCodebook,
  type Codebook,
} from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";

export default function ProjectCodebookDetailPage() {
  const { projectId, codebookId } = useParams<{ projectId: string; codebookId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [nextVersion, setNextVersion] = useState<Codebook | null>(null);
  const [revising, setRevising] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cb = await getCodebookById(codebookId);
      if (cancelled) return;
      if (!cb || cb.projectId !== projectId) {
        setCodebook(null);
        setLoading(false);
        return;
      }
      const [p, cds, next] = await Promise.all([
        getProjectById(projectId),
        listCodesForCodebook(codebookId),
        getNextVersionCodebook(codebookId),
      ]);
      if (cancelled) return;
      setProject(p);
      setCodebook(cb);
      setCodes(cds);
      setNextVersion(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, codebookId]);

  async function handleRevise() {
    setRevising(true);
    try {
      const created = await reviseCodebook(codebookId);
      toast.success(`Created "${created.name}" v${created.version}`);
      router.push(`/projects/${projectId}/codebooks/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRevising(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!codebook || !project) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p className="text-sm text-gray-500">Codebook not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Codebooks", href: `/projects/${projectId}/codebooks` },
          { label: codebook.name },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/projects/${projectId}/codebooks`} label="Codebooks" />
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{project.name}</p>
          <h1 className="text-2xl font-semibold">
            {codebook.name} <span className="text-base font-normal text-gray-400">v{codebook.version}</span>
          </h1>
          {codebook.previousVersionId && (
            <Link
              href={`/projects/${projectId}/codebooks/${codebook.previousVersionId}`}
              className="text-xs text-gray-500 underline"
            >
              ↩ Revised from v{codebook.version - 1}
            </Link>
          )}
        </div>
        {nextVersion ? (
          <Link
            href={`/projects/${projectId}/codebooks/${nextVersion.id}`}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            A newer version (v{nextVersion.version}) exists →
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleRevise}
            disabled={revising}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {revising ? "Revising…" : "Revise this codebook →"}
          </button>
        )}
      </div>

      <div className="mt-6">
        <CodeManager codebookId={codebookId} codes={codes} />
      </div>
    </main>
  );
}
