"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CodeManager } from "@/app/games/[gameId]/codebooks/[codebookId]/CodeManager";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getProjectById, type Project } from "@/lib/localDb/queries/projects";
import { getCodebookById, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";

export default function ProjectCodebookDetailPage() {
  const { projectId, codebookId } = useParams<{ projectId: string; codebookId: string }>();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);

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
      const [p, cds] = await Promise.all([getProjectById(projectId), listCodesForCodebook(codebookId)]);
      if (cancelled) return;
      setProject(p);
      setCodebook(cb);
      setCodes(cds);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, codebookId]);

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
      <div className="mt-2">
        <p className="text-sm text-gray-500">{project.name}</p>
        <h1 className="text-2xl font-semibold">{codebook.name}</h1>
      </div>

      <div className="mt-6">
        <CodeManager codebookId={codebookId} codes={codes} />
      </div>
    </main>
  );
}
