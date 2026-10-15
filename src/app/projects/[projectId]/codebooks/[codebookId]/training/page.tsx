"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { cohensKappa, interpretKappa } from "@/lib/kappa";
import { runIndependentAiPass } from "@/lib/independentAiPass";
import { getCodebookById, reviseCodebook, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { listGamesForProject } from "@/lib/localDb/queries/projects";
import {
  startTraining,
  getTrainingForCodebook,
  listSplitAssignments,
  countSplitAssignmentsByBucket,
  type CodebookTraining,
  type SplitBucket,
} from "@/lib/localDb/queries/training";
import { listTaggingsForCodebookAnalytics, type TaggingForAnalytics } from "@/lib/localDb/queries/taggings";

const DEFAULT_CALIBRATION_SIZE = 20;
const DEFAULT_HELD_OUT_PERCENT = 30;
const DEFAULT_VERIFICATION_SHARE_PERCENT = 50;

export default function ProjectTrainingPage() {
  const { projectId, codebookId } = useParams<{ projectId: string; codebookId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [gameNames, setGameNames] = useState<Record<string, string>>({});
  const [gameIds, setGameIds] = useState<string[]>([]);
  const [training, setTraining] = useState<CodebookTraining | null>(null);
  const [counts, setCounts] = useState<Record<SplitBucket, number>>({ calibration: 0, test: 0, verification: 0 });
  const [calibrationReviews, setCalibrationReviews] = useState<
    { id: string; reviewId: string; reviewText: string; reviewGameId: string }[]
  >([]);
  const [taggings, setTaggings] = useState<TaggingForAnalytics[]>([]);

  const [calibrationSampleSize, setCalibrationSampleSize] = useState(DEFAULT_CALIBRATION_SIZE);
  const [heldOutPercent, setHeldOutPercent] = useState(DEFAULT_HELD_OUT_PERCENT);
  const [verificationSharePercent, setVerificationSharePercent] = useState(DEFAULT_VERIFICATION_SHARE_PERCENT);
  const [distributionMode, setDistributionMode] = useState<"equal" | "proportional">("equal");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [runningAiPass, setRunningAiPass] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [revising, setRevising] = useState(false);

  async function load() {
    const cb = await getCodebookById(codebookId);
    if (!cb) {
      setCodebook(null);
      setLoading(false);
      return;
    }
    setCodebook(cb);
    const [cds, games] = await Promise.all([listCodesForCodebook(codebookId), listGamesForProject(projectId)]);
    setCodes(cds);
    setGameIds(games.map((g) => g.id));
    setGameNames(Object.fromEntries(games.map((g) => [g.id, g.name])));

    const t = await getTrainingForCodebook(codebookId);
    setTraining(t);
    if (t) {
      const [c, calib, tgs] = await Promise.all([
        countSplitAssignmentsByBucket(t.id),
        listSplitAssignments(t.id, "calibration"),
        listTaggingsForCodebookAnalytics(codebookId),
      ]);
      setCounts(c);
      setCalibrationReviews(calib);
      setTaggings(tgs);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codebookId]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    setError(null);
    try {
      await startTraining({
        codebookId,
        gameIds,
        filters: {},
        calibrationSampleSize,
        heldOutPercent,
        verificationSharePercent,
        distributionMode,
      });
      await load();
      toast.success("Calibration split drawn — start blind-tagging the calibration sample");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setStarting(false);
    }
  }

  const humanCodedReviewIds = new Set(
    taggings.filter((t) => t.coderKind === "HUMAN").map((t) => t.reviewId),
  );
  const aiCodedReviewIds = new Set(taggings.filter((t) => t.coderKind === "AI").map((t) => t.reviewId));
  const readyForAiPass = calibrationReviews.filter(
    (r) => humanCodedReviewIds.has(r.reviewId) && !aiCodedReviewIds.has(r.reviewId),
  );

  async function handleRunAiPass() {
    setRunningAiPass(true);
    setAiProgress({ done: 0, total: readyForAiPass.length });
    const codeInputs = codes.map((c) => ({ id: c.id, label: c.label, description: c.description, color: c.color }));
    let failed = 0;
    for (let i = 0; i < readyForAiPass.length; i++) {
      const r = readyForAiPass[i]!;
      const result = await runIndependentAiPass(r.reviewId, r.reviewText, codeInputs);
      if (result.error) failed++;
      setAiProgress({ done: i + 1, total: readyForAiPass.length });
    }
    setRunningAiPass(false);
    if (failed > 0) {
      toast.error(`${failed} review(s) failed — likely rate-limited. Try again shortly.`);
    } else {
      toast.success("AI coded the calibration sample independently");
    }
    await load();
  }

  async function handleRevise() {
    setRevising(true);
    try {
      const created = await reviseCodebook(codebookId);
      toast.success(`Revised to v${created.version} — the same calibration split carries forward`);
      router.push(`/projects/${projectId}/codebooks/${created.id}/training`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRevising(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }
  if (!codebook) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-gray-500">Codebook not found.</p>
      </main>
    );
  }

  const breadcrumbItems = [
    { label: "Projects", href: "/projects" },
    { label: "Codebooks", href: `/projects/${projectId}/codebooks` },
    { label: codebook.name, href: `/projects/${projectId}/codebooks/${codebookId}` },
    { label: "Training" },
  ];

  if (!training) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="mt-2">
          <BackButton href={`/projects/${projectId}/codebooks/${codebookId}`} label={codebook.name} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Set up training</h1>
        <p className="mt-1 text-sm text-gray-500">
          Draws a one-time random split across every game in this project: a small calibration
          sample you&apos;ll hand-code blind (no AI help), plus a held-out test/verification pool
          reserved until the model&apos;s measured performance earns trust. Can&apos;t be redrawn
          once started.
        </p>

        <form onSubmit={handleStart} className="mt-6 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Calibration sample size (total, across games)</span>
            <input
              type="number"
              min={5}
              max={200}
              value={calibrationSampleSize}
              onChange={(e) => setCalibrationSampleSize(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Distribute across games</span>
            <select
              value={distributionMode}
              onChange={(e) => setDistributionMode(e.target.value as "equal" | "proportional")}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="equal">Equally — same number of reviews from each game</option>
              <option value="proportional">Proportionally — weighted by each game&apos;s review count</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">% held out for Test + Verification</span>
            <input
              type="number"
              min={5}
              max={80}
              value={heldOutPercent}
              onChange={(e) => setHeldOutPercent(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <span className="text-xs text-gray-500">Of each game&apos;s remaining pool, after the calibration sample.</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Of the held-out share, % Verification (rest is Test)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={verificationSharePercent}
              onChange={(e) => setVerificationSharePercent(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <button
            type="submit"
            disabled={starting || gameIds.length === 0}
            className="self-start rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
          >
            {starting ? "Drawing split…" : "Start calibration"}
          </button>
          {gameIds.length === 0 && (
            <p className="text-xs text-gray-500">Add at least one game to this project first.</p>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  const calibrationDone = calibrationReviews.filter((r) => humanCodedReviewIds.has(r.reviewId)).length;

  const mismatches = calibrationReviews
    .filter((r) => aiCodedReviewIds.has(r.reviewId))
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

  const pairs = calibrationReviews
    .filter((r) => humanCodedReviewIds.has(r.reviewId) && aiCodedReviewIds.has(r.reviewId))
    .flatMap((r) =>
      codes.map((code) => ({
        humanPresent: taggings.some(
          (t) => t.reviewId === r.reviewId && t.codeId === code.id && t.coderKind === "HUMAN",
        ),
        aiPresent: taggings.some((t) => t.reviewId === r.reviewId && t.codeId === code.id && t.coderKind === "AI"),
      })),
    );
  const reliability = pairs.length > 0 ? cohensKappa(pairs) : null;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="mt-2">
        <BackButton href={`/projects/${projectId}/codebooks/${codebookId}`} label={codebook.name} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {codebook.name} <span className="text-base font-normal text-gray-400">v{codebook.version}</span> — Training
        </h1>
        <button
          type="button"
          onClick={handleRevise}
          disabled={revising}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {revising ? "Revising…" : "Revise codebook →"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Phase: <span className="font-medium">{training.phase}</span> · {counts.calibration} calibration ·{" "}
        {counts.test} test (reserved) · {counts.verification} verification (reserved)
      </p>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">1. Blind-tag the calibration sample</h2>
        <p className="mt-1 text-xs text-gray-500">
          {calibrationDone} of {calibrationReviews.length} tagged. No AI help on these.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {calibrationReviews.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-2 text-sm">
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                {gameNames[r.reviewGameId] ?? "Unknown game"}
              </span>
              <p className="line-clamp-1 flex-1 text-gray-600">{r.reviewText.slice(0, 80)}</p>
              <span className="shrink-0 text-xs text-gray-500">
                {humanCodedReviewIds.has(r.reviewId) ? "✓ tagged" : "not yet"}
                {aiCodedReviewIds.has(r.reviewId) ? " · AI coded" : ""}
              </span>
              <Link
                href={`/projects/${projectId}/codebooks/${codebookId}/training/tag/${r.reviewId}`}
                className="shrink-0 text-xs underline"
              >
                {humanCodedReviewIds.has(r.reviewId) ? "Review" : "Tag"} →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        <h2 className="font-medium">2. Run the AI independently</h2>
        <p className="mt-1 text-xs text-gray-500">
          Codes every blind-tagged calibration review on its own — no accept/reject step.
        </p>
        <button
          type="button"
          onClick={handleRunAiPass}
          disabled={runningAiPass || readyForAiPass.length === 0}
          className="mt-3 rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {runningAiPass
            ? `Coding… (${aiProgress?.done ?? 0}/${aiProgress?.total ?? 0})`
            : readyForAiPass.length === 0
              ? "Nothing new to code"
              : `Run on ${readyForAiPass.length} review(s)`}
        </button>
      </section>

      {reliability && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <h2 className="font-medium">3. Compare</h2>
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
                    <span className="mr-1 rounded bg-white px-1 py-0.5 text-gray-600">
                      {gameNames[m.review.reviewGameId] ?? "Unknown game"}
                    </span>
                    {m.review.reviewText.slice(0, 120)}
                  </p>
                  <p className="mt-1 text-gray-500">
                    You: {[...m.humanCodes].map((id) => codes.find((c) => c.id === id)?.label).join(", ") || "none"}{" "}
                    · AI: {[...m.aiCodes].map((id) => codes.find((c) => c.id === id)?.label).join(", ") || "none"}
                  </p>
                </li>
              ))}
            {mismatches.every((m) => m.agrees) && mismatches.length > 0 && (
              <li className="text-xs text-gray-500">No disagreements in the calibration sample.</li>
            )}
          </ul>
        </section>
      )}
    </main>
  );
}
