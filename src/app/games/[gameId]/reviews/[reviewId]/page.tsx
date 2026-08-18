"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TagEditor } from "./TagEditor";
import { ReviewNav } from "./ReviewNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { CodebookToolbar } from "@/components/CodebookToolbar";
import type { ReviewSearchParams } from "@/lib/localDb/queries/reviewFilters";
import { getGameById, type Game } from "@/lib/localDb/queries/games";
import { getReviewById, listReviewIdsOrdered, type Review } from "@/lib/localDb/queries/reviews";
import { listCodebooksForGame, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { listTaggingsForReview, type TaggingWithCode } from "@/lib/localDb/queries/taggings";
import { resolveActiveCodebookId } from "@/lib/activeCodebook";

type SearchParams = ReviewSearchParams & { codebookId?: string };

export default function ReviewDetailPage() {
  const { gameId, reviewId } = useParams<{ gameId: string; reviewId: string }>();
  const searchParams = useSearchParams();
  const sp: SearchParams = Object.fromEntries(searchParams.entries());

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [codebooks, setCodebooks] = useState<Codebook[]>([]);
  const [activeCodebookId, setActiveCodebookId] = useState<string | undefined>(undefined);
  const [codes, setCodes] = useState<Code[]>([]);
  const [taggings, setTaggings] = useState<TaggingWithCode[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [g, r, cbs] = await Promise.all([
        getGameById(gameId),
        getReviewById(reviewId),
        listCodebooksForGame(gameId),
      ]);
      if (cancelled) return;
      setGame(g);
      setReview(r && r.gameId === gameId ? r : null);
      setCodebooks(cbs);

      if (cbs.length > 0) {
        const active = resolveActiveCodebookId(gameId, cbs, searchParams.get("codebookId"))!;
        setActiveCodebookId(active);
        const [cds, tgs, ids] = await Promise.all([
          listCodesForCodebook(active),
          listTaggingsForReview(reviewId, active),
          listReviewIdsOrdered(gameId, sp),
        ]);
        if (cancelled) return;
        setCodes(cds);
        setTaggings(tgs);
        setOrderedIds(ids);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, reviewId, searchParams.toString()]);

  const breadcrumbItems = [
    { label: "Games", href: "/games" },
    { label: game?.name ?? "…", href: `/games/${gameId}/reviews` },
    { label: "Reviews", href: `/games/${gameId}/reviews` },
    { label: "Review" },
  ];

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!game || !review) {
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
          <BackButton href={`/games/${gameId}/reviews`} label="Reviews" />
        </div>
        <p className="mt-4 text-sm text-gray-500">
          No codebooks exist for this game yet.{" "}
          <Link href={`/games/${gameId}/codebooks`} className="underline">
            Create one first →
          </Link>
        </p>
      </main>
    );
  }

  const currentIndex = orderedIds.findIndex((id) => id === reviewId);
  const position = currentIndex === -1 ? 1 : currentIndex + 1;
  const prevId = currentIndex > 0 ? orderedIds[currentIndex - 1] : undefined;
  const nextId =
    currentIndex !== -1 && currentIndex < orderedIds.length - 1
      ? orderedIds[currentIndex + 1]
      : undefined;

  const navQuery = new URLSearchParams();
  if (sp.voted) navQuery.set("voted", sp.voted);
  if (sp.earlyAccess) navQuery.set("earlyAccess", sp.earlyAccess);
  if (sp.playtime) navQuery.set("playtime", sp.playtime);
  if (sp.from) navQuery.set("from", sp.from);
  if (sp.to) navQuery.set("to", sp.to);
  if (sp.purchase) navQuery.set("purchase", sp.purchase);
  if (sp.language) navQuery.set("language", sp.language);
  if (sp.minVotes) navQuery.set("minVotes", sp.minVotes);
  if (sp.minLength) navQuery.set("minLength", sp.minLength);
  if (sp.sort) navQuery.set("sort", sp.sort);
  if (activeCodebookId) navQuery.set("codebookId", activeCodebookId);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="mt-2">
        <BackButton href={`/games/${gameId}/reviews`} label="Reviews" />
      </div>

      <CodebookToolbar
        gameId={gameId}
        gameName={game.name}
        codebooks={codebooks}
        activeCodebookId={activeCodebookId}
      />

      <div className="mt-4">
        <ReviewNav
          gameId={gameId}
          query={navQuery.toString()}
          position={position}
          total={orderedIds.length}
          prevId={prevId}
          nextId={nextId}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
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

      <div className="mt-6">
        <ReviewNav
          gameId={gameId}
          query={navQuery.toString()}
          position={position}
          total={orderedIds.length}
          prevId={prevId}
          nextId={nextId}
        />
      </div>
    </main>
  );
}
