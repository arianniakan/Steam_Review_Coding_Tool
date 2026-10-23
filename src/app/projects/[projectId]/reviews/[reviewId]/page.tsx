"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { TagEditor } from "@/app/games/[gameId]/reviews/[reviewId]/TagEditor";
import { EditReviewText } from "@/app/games/[gameId]/reviews/[reviewId]/EditReviewText";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { CodebookToolbar } from "@/components/CodebookToolbar";
import { getProjectById, type Project } from "@/lib/localDb/queries/projects";
import { getReviewById, deleteReview, type Review } from "@/lib/localDb/queries/reviews";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { listCodebooksForProject, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { listTaggingsForReview, type TaggingWithCode } from "@/lib/localDb/queries/taggings";
import { getGatedReviewIds } from "@/lib/localDb/queries/training";
import {
  listIrrelevantReviewIds,
  unmarkReviewIrrelevant,
} from "@/lib/localDb/queries/reviewRelevance";
import { resolveActiveProjectCodebookId } from "@/lib/activeCodebook";
import { PageLoading } from "@/components/PageLoading";

export default function ProjectReviewDetailPage() {
  const { projectId, reviewId } = useParams<{ projectId: string; reviewId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [codebooks, setCodebooks] = useState<Codebook[]>([]);
  const [activeCodebookId, setActiveCodebookId] = useState<string | undefined>(undefined);
  const [codes, setCodes] = useState<Code[]>([]);
  const [taggings, setTaggings] = useState<TaggingWithCode[]>([]);
  const [gated, setGated] = useState(false);
  const [irrelevant, setIrrelevant] = useState(false);
  const [unmarking, setUnmarking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const [p, r, cbs] = await Promise.all([
      getProjectById(projectId),
      getReviewById(reviewId),
      listCodebooksForProject(projectId),
    ]);
    setProject(p);
    setReview(r);
    setCodebooks(cbs);

    if (r) {
      const g = await getGameById(r.gameId);
      setGame(g);
    }

    if (cbs.length > 0) {
      const active = resolveActiveProjectCodebookId(projectId, cbs, searchParams.get("codebookId"))!;
      setActiveCodebookId(active);
      const [cds, tgs, gatedIds, irrelevantIds] = await Promise.all([
        listCodesForCodebook(active),
        listTaggingsForReview(reviewId, active),
        getGatedReviewIds(active),
        listIrrelevantReviewIds(active),
      ]);
      setCodes(cds);
      setTaggings(tgs);
      setGated(gatedIds.includes(reviewId));
      setIrrelevant(irrelevantIds.includes(reviewId));
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reviewId, searchParams.toString()]);

  async function handleUnmarkIrrelevant() {
    if (!activeCodebookId) return;
    setUnmarking(true);
    try {
      await unmarkReviewIrrelevant(reviewId, activeCodebookId);
      await load();
    } finally {
      setUnmarking(false);
    }
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteReview(reviewId);
      toast.success("Review deleted");
      router.push(`/projects/${projectId}/reviews`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete review");
      setDeleting(false);
    }
  }

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
    return <PageLoading />;
  }

  if (!project || !review) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-8">
        <p className="text-sm text-gray-500">Review not found.</p>
      </main>
    );
  }

  if (codebooks.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-8">
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
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
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
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-red-700">Permanently delete this review?</span>
            <button type="button" onClick={handleDelete} disabled={deleting} className="font-medium text-red-700 underline disabled:opacity-50">
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="text-gray-500 underline disabled:opacity-50">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={handleDelete} className="text-xs text-red-600 underline">
            Delete review →
          </button>
        )}
      </div>

      <EditReviewText review={review} onUpdated={setReview} />

      {gated ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
          This review is reserved for this codebook&apos;s training (held out for a blind
          test/verification check) and can&apos;t be tagged here until that training is
          verified. Tag it from the{" "}
          <Link href={`/projects/${projectId}/codebooks/${activeCodebookId}/training`} className="underline">
            Training flow
          </Link>{" "}
          instead.
        </div>
      ) : irrelevant ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
          This review is excluded from this codebook, so it&apos;s hidden from the normal tagging
          flow.
          <button
            type="button"
            onClick={handleUnmarkIrrelevant}
            disabled={unmarking}
            className="ml-1 underline disabled:opacity-50"
          >
            {unmarking ? "Re-including…" : "Re-include"}
          </button>
        </div>
      ) : (
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
          promptOverride={codebooks.find((cb) => cb.id === activeCodebookId)?.promptOverride}
        />
      )}
    </main>
  );
}
