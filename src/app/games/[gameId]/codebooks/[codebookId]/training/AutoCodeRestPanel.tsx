"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { runIndependentAiPass } from "@/lib/independentAiPass";
import {
  listUntrainedReviews,
  markAutoCodeAttempted,
  type CodebookTraining,
  type UntrainedReview,
} from "@/lib/localDb/queries/training";
import type { Code } from "@/lib/localDb/queries/codes";

const DEFAULT_BATCH_SIZE = 25;

// The Phase B4 payoff: once a training is verified, let the AI code
// everything nobody has touched yet, unsupervised — same independent pass
// as calibration/test/verification, just applied to the rest of the
// corpus. No blind-tag or compare step here: there's no human judgment to
// compare against, since trust was already earned via verification.
export function AutoCodeRestPanel({
  training,
  gameIds,
  codebookId,
  codes,
}: {
  training: CodebookTraining;
  gameIds: string[];
  codebookId: string;
  codes: Code[];
}) {
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<UntrainedReview[]>([]);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function load() {
    const [reviews, batchSizeRes] = await Promise.all([
      listUntrainedReviews(training, gameIds, codebookId),
      fetch("/api/auto-code-batch-size")
        .then((r) => r.json())
        .catch(() => ({ batchSize: DEFAULT_BATCH_SIZE })),
    ]);
    setRemaining(reviews);
    setBatchSize(batchSizeRes.batchSize ?? DEFAULT_BATCH_SIZE);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training.id]);

  async function handleRunBatch() {
    const batch = remaining.slice(0, batchSize);
    setRunning(true);
    setProgress({ done: 0, total: batch.length });
    const codeInputs = codes.map((c) => ({ id: c.id, label: c.label, description: c.description, color: c.color }));
    let failed = 0;
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i]!;
      const result = await runIndependentAiPass(r.reviewId, r.reviewText, codeInputs);
      if (result.error) {
        failed++;
      } else {
        // Marked even on zero suggestions — see markAutoCodeAttempted's
        // doc comment for why, same reasoning as the B3 aiAttemptedAt fix.
        await markAutoCodeAttempted(training.id, r.reviewId);
      }
      setProgress({ done: i + 1, total: batch.length });
    }
    setRunning(false);
    if (failed > 0) {
      toast.error(`${failed} review(s) failed — likely rate-limited. Try again shortly.`);
    } else {
      toast.success(`Auto-coded ${batch.length} review(s)`);
    }
    await load();
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">Auto-code the rest</h2>
        <p className="mt-1 text-xs text-gray-500">Loading…</p>
      </section>
    );
  }

  const batch = remaining.slice(0, batchSize);

  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <h2 className="font-medium">Auto-code the rest</h2>
      {remaining.length === 0 ? (
        <p className="mt-1 text-xs text-gray-500">
          Nothing left — every review in this training&apos;s scope is coded or accounted for.
        </p>
      ) : (
        <p className="mt-1 text-xs text-gray-500">
          {remaining.length} review(s) left uncoded. Runs up to {batchSize} per click — one click, one capped
          batch, so nothing burns through the whole corpus (or your budget) unsupervised in one shot. Check the{" "}
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            OpenAI usage dashboard
          </a>{" "}
          for actual cost — this isn&apos;t an estimate.
        </p>
      )}
      {remaining.length > 0 && (
        <button
          type="button"
          onClick={handleRunBatch}
          disabled={running}
          className="mt-3 rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {running
            ? `Coding… (${progress?.done ?? 0}/${progress?.total ?? 0})`
            : `Run next ${batch.length} review(s) →`}
        </button>
      )}
    </section>
  );
}
