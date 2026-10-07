"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TagEditor } from "@/app/games/[gameId]/reviews/[reviewId]/TagEditor";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { CodebookToolbar } from "@/components/CodebookToolbar";
import { getProjectById, type Project } from "@/lib/localDb/queries/projects";
import { getReviewById, type Review } from "@/lib/localDb/queries/reviews";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { listCodebooksForProject, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { listTaggingsForReview, type TaggingWithCode } from "@/lib/localDb/queries/taggings";
import { resolveActiveProjectCodebookId } from "@/lib/activeCodebook";

export default function ProjectReviewDetailPage() {
  const { projectId, reviewId } = useParams<{ projectId: string; reviewId: string }>();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [codebooks, setCodebooks] = useState<Codebook[]>([]);
  const [activeCodebookId, setActiveCodebookId] = useState<string | undefined>(undefined);
  const [codes, setCodes] = useState<Code[]>([]);
  const [taggings, setTaggings] = useState<TaggingWithCode[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [p, r, cbs] = await Promise.all([
        getProjectById(projectId),
        getReviewById(reviewId),
        listCodebooksForProject(projectId),
      ]);
      if (cancelled) return;
      setProject(p);
      setReview(r);
      setCodebooks(cbs);

      if (r) {
        const g = await getGameById(r.gameId);
        if (cancelled) return;
        setGame(g);
      }

      if (cbs.length > 0) {
        const active = resolveActiveProjectCodebookId(projectId, cbs, searchParams.get("codebookId"))!;
        setActiveCodebookId(active);
        const [cds, tgs] = await Promise.all([
          listCodesForCodebook(active),
          listTaggingsForReview(reviewId, active),
        ]);
        if (cancelled) return;
        setCodes(cds);
        setTaggings(tgs);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reviewId, searchParams.toString()]);

  const backQuery = new URLSearchParams(searchParams.toString());
  backQuery.delete("codebookId");
  if (activeCodebookId) backQuery.set("codebookId", activeCodebookId);
  const backHref = `/projects/${projectId}/reviews?${backQuery.toString()}`;

  const breadcrumbItems = [
    { label: "Projects", href: "/projects" },
    { label: project?.name ?? "…", href: `/projects/${projectId}` },
    { label: "Reviews", href: backHref },
    { label: "Review" },
  ];

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!project || !review) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">Review not found.</p>
      </main>
    );
  }

  if (codebooks.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="mt-2">
          <BackButton href={backHref} label="Reviews" />
        </div>
        <p className="mt-4 text-sm text-gray-500">
          No codebooks exist for this project yet.{" "}
          <Link href={`/projects/${projectId}/codebooks`} className="underline">
            Create one first →
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="mt-2">
        <BackButton href={backHref} label="Reviews" />
      </div>

      <CodebookToolbar
        scope={{ type: "project", projectId }}
        contextName={project.name}
        codebooks={codebooks}
        activeCodebookId={activeCodebookId}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {game && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
            {game.name}
          </span>
        )}
        <span className={review.votedUp ? "text-green-700" : "text-red-700"}>
          {review.votedUp ? "Recommended" : "Not recommended"}
        </span>
        <span>·</span>
        <span>{(review.playtimeForever / 60).toFixed(1)}h playtime</span>
        <span>·</span>
        <span>{new Date(review.timestampCreated).toISOString().slice(0, 10)}</span>
      </div>

      <TagEditor
        reviewId={reviewId}
        reviewText={review.text}
        codebookId={activeCodebookId!}
        codes={codes.map((c) => ({
          id: c.id,
          label: c.label,
          description: c.description,
          color: c.color,
          parentCodeId: c.parentCodeId,
        }))}
        initialTaggings={taggings.map((t) => ({
          id: t.id,
          spanStart: t.spanStart,
          spanEnd: t.spanEnd,
          memo: t.memo,
          aiConfidence: t.aiConfidence,
          aiRationale: t.aiRationale,
          code: { id: t.codeId, label: t.codeLabel, color: t.codeColor },
          coder: { name: t.coderName, kind: t.coderKind },
        }))}
      />
    </main>
  );
}
