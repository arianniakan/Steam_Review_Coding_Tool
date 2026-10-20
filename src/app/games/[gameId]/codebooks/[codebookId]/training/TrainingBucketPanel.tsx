"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cohensKappa, interpretKappa } from "@/lib/kappa";
import { runIndependentAiPass } from "@/lib/independentAiPass";
import { markAiAttempted } from "@/lib/localDb/queries/training";
import type { Code } from "@/lib/localDb/queries/codes";
import type { TaggingForAnalytics } from "@/lib/localDb/queries/taggings";

export interface BucketReview {
  id: string;
  reviewId: string;
  reviewText: string;
  reviewGameId?: string;
  aiAttemptedAt?: string | null;
}

// Shared by both the calibration and test bucket panels (and both the
// game- and project-scoped training pages) — the blind-tag -> independent-AI
// -> compare pattern is identical for every held-out bucket, only the data
// and step numbers differ.
//
// "aiAttemptedIds" (not just "has an AI Tagging row") drives readiness and
// the mismatch set: the independent AI pass can legitimately find zero
// applicable codes, which writes no Tagging row at all — without tracking
// the attempt itself, that review would look indistinguishable from "never
// run" and could never be counted as done.
export function computeBucketStats(reviews: BucketReview[], taggings: TaggingForAnalytics[], codes: Code[]) {
  const humanCodedIds = new Set(taggings.filter((t) => t.coderKind === "HUMAN").map((t) => t.reviewId));
  const aiCodedIds = new Set(taggings.filter((t) => t.coderKind === "AI").map((t) => t.reviewId));
  const aiAttemptedIds = new Set([...aiCodedIds, ...reviews.filter((r) => r.aiAttemptedAt).map((r) => r.reviewId)]);
  const done = reviews.filter((r) => humanCodedIds.has(r.reviewId)).length;
  const readyForAiPass = reviews.filter((r) => humanCodedIds.has(r.reviewId) && !aiAttemptedIds.has(r.reviewId));

  const mismatches = reviews
    .filter((r) => aiAttemptedIds.has(r.reviewId))
    .map((r) => {
      const humanCodes = new Set(
        taggings.filter((t) => t.reviewId === r.reviewId && t.coderKind === "HUMAN").map((t) => t.codeId),
      );
      const aiCodes = new Set(
        taggings.filter((t) => t.reviewId === r.reviewId && t.coderKind === "AI").map((t) => t.codeId),
      );
      const agrees = humanCodes.size === aiCodes.size && [...humanCodes].every((c) => aiCodes.has(c));
      return { review: r, humanCodes, aiCodes, agrees };
    });

  const pairs = reviews
    .filter((r) => humanCodedIds.has(r.reviewId) && aiAttemptedIds.has(r.reviewId))
    .flatMap((r) =>
      codes.map((code) => ({
        humanPresent: taggings.some(
          (t) => t.reviewId === r.reviewId && t.codeId === code.id && t.coderKind === "HUMAN",
        ),
        aiPresent: taggings.some((t) => t.reviewId === r.reviewId && t.codeId === code.id && t.coderKind === "AI"),
      })),
    );
  const reliability = pairs.length > 0 ? cohensKappa(pairs) : null;

  return { humanCodedIds, aiCodedIds, aiAttemptedIds, done, readyForAiPass, mismatches, reliability };
}

export function TrainingBucketPanel({
  trainingId,
  stepStart,
  bucketLabel,
  reviews,
  taggings,
  codes,
  tagHrefFor,
  gameNames,
  nudge,
  onChanged,
  promptOverride,
}: {
  trainingId: string;
  stepStart: number;
  bucketLabel: string;
  reviews: BucketReview[];
  taggings: TaggingForAnalytics[];
  codes: Code[];
  tagHrefFor: (reviewId: string) => string;
  gameNames?: Record<string, string>;
  nudge?: string;
  onChanged: () => void | Promise<void>;
  promptOverride?: string | null;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { humanCodedIds, aiCodedIds, aiAttemptedIds, done, readyForAiPass, mismatches, reliability } =
    computeBucketStats(reviews, taggings, codes);

  async function handleRunAiPass() {
    setRunning(true);
    setProgress({ done: 0, total: readyForAiPass.length });
    const codeInputs = codes.map((c) => ({ id: c.id, label: c.label, description: c.description, color: c.color }));
    let failed = 0;
    for (let i = 0; i < readyForAiPass.length; i++) {
      const r = readyForAiPass[i]!;
      const result = await runIndependentAiPass(r.reviewId, r.reviewText, codeInputs, promptOverride);
      if (result.error) {
        failed++;
      } else {
        // Mark attempted even when zero codes were suggested — that's a
        // real (and comparable) AI judgment, not a missing run.
        await markAiAttempted(trainingId, r.reviewId);
      }
      setProgress({ done: i + 1, total: readyForAiPass.length });
    }
    setRunning(false);
    if (failed > 0) {
      toast.error(`${failed} review(s) failed — likely rate-limited. Try again shortly.`);
    } else {
      toast.success(`AI coded the ${bucketLabel} independently`);
    }
    await onChanged();
  }

  return (
    <>
      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">
          {stepStart}. Blind-tag the {bucketLabel}
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {done} of {reviews.length} tagged. No AI help on these — see the codebook&apos;s codes only.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-2 text-sm"
            >
              {gameNames && r.reviewGameId && (
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                  {gameNames[r.reviewGameId] ?? "Unknown game"}
                </span>
              )}
              <p className="line-clamp-1 flex-1 text-gray-600">{r.reviewText.slice(0, gameNames ? 80 : 100)}</p>
              <span className="shrink-0 text-xs text-gray-500">
                {humanCodedIds.has(r.reviewId) ? "✓ tagged" : "not yet"}
                {aiCodedIds.has(r.reviewId)
                  ? " · AI coded"
                  : aiAttemptedIds.has(r.reviewId)
                    ? " · AI: no codes"
                    : ""}
              </span>
              <Link href={tagHrefFor(r.reviewId)} className="shrink-0 text-xs underline">
                {humanCodedIds.has(r.reviewId) ? "Review" : "Tag"} →
              </Link>
            </li>
          ))}
          {reviews.length === 0 && <li className="text-xs text-gray-500">Nothing drawn into this bucket.</li>}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">{stepStart + 1}. Run the AI independently</h2>
        <p className="mt-1 text-xs text-gray-500">
          Codes every blind-tagged {bucketLabel} review on its own — no accept/reject step, since the
          point is measuring what it does unsupervised.
        </p>
        {nudge && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{nudge}</p>}
        <button
          type="button"
          onClick={handleRunAiPass}
          disabled={running || readyForAiPass.length === 0}
          className="mt-3 rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {running
            ? `Coding… (${progress?.done ?? 0}/${progress?.total ?? 0})`
            : readyForAiPass.length === 0
              ? "Nothing new to code"
              : `Run on ${readyForAiPass.length} review(s)`}
        </button>
      </section>

      {reliability && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <h2 className="font-medium">{stepStart + 2}. Compare</h2>
          {reliability.kappa === null ? (
            <p className="mt-2 text-sm text-gray-500">Perfect agreement with no variance — κ is undefined.</p>
          ) : (
            <p className="mt-2 text-2xl font-semibold">
              κ = {reliability.kappa.toFixed(3)}{" "}
              <span className="text-sm font-normal text-gray-500">({interpretKappa(reliability.kappa)})</span>
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Over {mismatches.length} review(s) × {codes.length} code(s) where both you and the AI have coded.
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {mismatches
              .filter((m) => !m.agrees)
              .map((m) => (
                <li key={m.review.id} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
                  <p className="text-gray-700">
                    {gameNames && m.review.reviewGameId && (
                      <span className="mr-1 rounded bg-white px-1 py-0.5 text-gray-600">
                        {gameNames[m.review.reviewGameId] ?? "Unknown game"}
                      </span>
                    )}
                    {m.review.reviewText.slice(0, 140)}
                  </p>
                  <p className="mt-1 text-gray-500">
                    You: {[...m.humanCodes].map((id) => codes.find((c) => c.id === id)?.label).join(", ") || "none"}{" "}
                    · AI: {[...m.aiCodes].map((id) => codes.find((c) => c.id === id)?.label).join(", ") || "none"}
                  </p>
                </li>
              ))}
            {mismatches.every((m) => m.agrees) && mismatches.length > 0 && (
              <li className="text-xs text-gray-500">No disagreements in the {bucketLabel}.</li>
            )}
          </ul>
        </section>
      )}
    </>
  );
}
