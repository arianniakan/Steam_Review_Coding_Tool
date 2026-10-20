"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BlindTagger } from "@/app/games/[gameId]/codebooks/[codebookId]/training/BlindTagger";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { getCodebookById, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { getReviewById, type Review } from "@/lib/localDb/queries/reviews";
import { listTaggingsForReview, type TaggingWithCode } from "@/lib/localDb/queries/taggings";
import { PageLoading } from "@/components/PageLoading";

export default function ProjectTrainingTagPage() {
  const { projectId, codebookId, reviewId } = useParams<{
    projectId: string;
    codebookId: string;
    reviewId: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [taggings, setTaggings] = useState<TaggingWithCode[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cb, cds, r, tgs] = await Promise.all([
        getCodebookById(codebookId),
        listCodesForCodebook(codebookId),
        getReviewById(reviewId),
        listTaggingsForReview(reviewId, codebookId),
      ]);
      if (cancelled) return;
      setCodebook(cb);
      setCodes(cds);
      setReview(r);
      setTaggings(tgs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [codebookId, reviewId]);

  if (loading) {
    return <PageLoading />;
  }

  if (!codebook || !review) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-8">
        <p className="text-sm text-gray-500">Not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: "Projects", href: "/projects" },
          { label: "Codebooks", href: `/projects/${projectId}/codebooks` },
          { label: codebook.name, href: `/projects/${projectId}/codebooks/${codebookId}/training` },
          { label: "Blind tagging" },
        ]}
      />
      <div className="mt-2">
        <BackButton href={`/projects/${projectId}/codebooks/${codebookId}/training`} label="Training" />
      </div>
      <h1 className="mt-2 text-xl font-semibold">Blind tagging</h1>
      <p className="mt-1 text-xs text-gray-500">
        No AI help here by design — tag only what you see. The model will code this review
        independently afterward, and the two will be compared.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className={review.votedUp ? "text-green-700" : "text-red-700"}>
          {review.votedUp ? "Recommended" : "Not recommended"}
        </span>
        <span>·</span>
        <span>{(review.playtimeForever / 60).toFixed(1)}h playtime</span>
      </div>

      <BlindTagger
        reviewId={reviewId}
        reviewText={review.text}
        codes={codes}
        initialTaggings={taggings.map((t) => ({
          id: t.id,
          spanStart: t.spanStart,
          spanEnd: t.spanEnd,
          memo: t.memo,
          code: { id: t.codeId, label: t.codeLabel, color: t.codeColor },
        }))}
      />
    </main>
  );
}
