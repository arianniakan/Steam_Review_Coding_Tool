"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BackButton } from "@/components/BackButton";
import { TrainingBucketPanel, computeBucketStats, type BucketReview } from "./TrainingBucketPanel";
import { AutoCodeRestPanel } from "./AutoCodeRestPanel";
import { getCodebookById, reviseCodebook, type Codebook } from "@/lib/localDb/queries/codebooks";
import { listCodesForCodebook, type Code } from "@/lib/localDb/queries/codes";
import { interpretKappa } from "@/lib/kappa";
import {
  startTraining,
  getTrainingForCodebook,
  listSplitAssignments,
  countSplitAssignmentsByBucket,
  advanceTrainingPhase,
  lockTraining,
  type CodebookTraining,
  type SplitBucket,
} from "@/lib/localDb/queries/training";
import { listTaggingsForCodebookAnalytics, type TaggingForAnalytics } from "@/lib/localDb/queries/taggings";

const DEFAULT_CALIBRATION_SIZE = 20;
const DEFAULT_HELD_OUT_PERCENT = 30;
const DEFAULT_VERIFICATION_SHARE_PERCENT = 50;

const TEST_NUDGE =
  "Repeated checks against the test set erode its value as a holdout. Treat this as a near-final check before locking, not another calibration round.";

export default function TrainingPage() {
  const { gameId, codebookId } = useParams<{ gameId: string; codebookId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [codebook, setCodebook] = useState<Codebook | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [training, setTraining] = useState<CodebookTraining | null>(null);
  const [counts, setCounts] = useState<Record<SplitBucket, number>>({ calibration: 0, test: 0, verification: 0 });
  const [calibrationReviews, setCalibrationReviews] = useState<BucketReview[]>([]);
  const [testReviews, setTestReviews] = useState<BucketReview[]>([]);
  const [verificationReviews, setVerificationReviews] = useState<BucketReview[]>([]);
  const [taggings, setTaggings] = useState<TaggingForAnalytics[]>([]);

  // Wizard state
  const [calibrationSampleSize, setCalibrationSampleSize] = useState(DEFAULT_CALIBRATION_SIZE);
  const [heldOutPercent, setHeldOutPercent] = useState(DEFAULT_HELD_OUT_PERCENT);
  const [verificationSharePercent, setVerificationSharePercent] = useState(DEFAULT_VERIFICATION_SHARE_PERCENT);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revising, setRevising] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [locking, setLocking] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function load() {
    const cb = await getCodebookById(codebookId);
    if (!cb) {
      setCodebook(null);
      setLoading(false);
      return;
    }
    setCodebook(cb);
    const cds = await listCodesForCodebook(codebookId);
    setCodes(cds);

    const t = await getTrainingForCodebook(codebookId);
    setTraining(t);
    if (t) {
      const [c, calib, test, verif, tgs] = await Promise.all([
        countSplitAssignmentsByBucket(t.id),
        listSplitAssignments(t.id, "calibration"),
        listSplitAssignments(t.id, "test"),
        listSplitAssignments(t.id, "verification"),
        listTaggingsForCodebookAnalytics(codebookId),
      ]);
      setCounts(c);
      setCalibrationReviews(calib);
      setTestReviews(test);
      setVerificationReviews(verif);
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
        gameIds: [gameId],
        filters: {},
        calibrationSampleSize,
        heldOutPercent,
        verificationSharePercent,
        distributionMode: "equal",
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

  async function handleRevise() {
    setRevising(true);
    try {
      const created = await reviseCodebook(codebookId);
      toast.success(`Revised to v${created.version} — the same split carries forward`);
      router.push(`/games/${gameId}/codebooks/${created.id}/training`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRevising(false);
    }
  }

  async function handleAdvanceToTesting() {
    if (!training) return;
    setAdvancing(true);
    try {
      await advanceTrainingPhase(training.id, "testing");
      await load();
      toast.success("Moved to the test phase — the test bucket is now ready to blind-tag");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleLock() {
    if (!training) return;
    setLocking(true);
    try {
      await lockTraining(training.id);
      await load();
      toast.success("Codebook locked for validation — no further edits or revisions");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLocking(false);
    }
  }

  async function handleMarkVerified() {
    if (!training) return;
    setVerifying(true);
    try {
      await advanceTrainingPhase(training.id, "verified");
      await load();
      toast.success("Training verified — every held-out review is now available for normal tagging");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setVerifying(false);
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
    { label: "Games", href: "/games" },
    { label: "Codebooks", href: `/games/${gameId}/codebooks` },
    { label: codebook.name, href: `/games/${gameId}/codebooks/${codebookId}` },
    { label: "Training" },
  ];

  // --- No training yet: setup wizard ---
  if (!training) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="mt-2">
          <BackButton href={`/games/${gameId}/codebooks/${codebookId}`} label={codebook.name} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Set up training</h1>
        <p className="mt-1 text-sm text-gray-500">
          Draws a one-time random split: a small calibration sample you&apos;ll hand-code blind
          (no AI help), plus a held-out test/verification pool reserved until the model&apos;s
          measured performance earns trust. This can&apos;t be redrawn once started.
        </p>

        <form onSubmit={handleStart} className="mt-6 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Calibration sample size</span>
            <input
              type="number"
              min={5}
              max={100}
              value={calibrationSampleSize}
              onChange={(e) => setCalibrationSampleSize(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1"
            />
            <span className="text-xs text-gray-500">Reviews you&apos;ll blind-tag and compare against the AI while refining the codebook.</span>
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
            <span className="text-xs text-gray-500">Taken from the remainder, after the calibration sample — reserved, not shown, until each phase runs.</span>
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
            disabled={starting}
            className="self-start rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
          >
            {starting ? "Drawing split…" : "Start calibration"}
          </button>
          {error && <p className="text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  const isLocked = training.phase === "locked" || training.phase === "verified";

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Breadcrumbs items={breadcrumbItems} />
      <div className="mt-2">
        <BackButton href={`/games/${gameId}/codebooks/${codebookId}`} label={codebook.name} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {codebook.name} <span className="text-base font-normal text-gray-400">v{codebook.version}</span> — Training
        </h1>
        {training.phase === "verified" ? (
          <span className="shrink-0 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-800">
            Verified ✓
          </span>
        ) : isLocked ? (
          <span className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
            Locked for validation
          </span>
        ) : (
          <button
            type="button"
            onClick={handleRevise}
            disabled={revising}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {revising ? "Revising…" : "Revise codebook →"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Phase: <span className="font-medium">{training.phase}</span> · {counts.calibration} calibration ·{" "}
        {counts.test} test{training.phase === "calibrating" ? " (reserved)" : ""} · {counts.verification} verification
        (reserved)
      </p>

      <TrainingBucketPanel
        trainingId={training.id}
        stepStart={1}
        bucketLabel="calibration sample"
        reviews={calibrationReviews}
        taggings={taggings}
        codes={codes}
        tagHrefFor={(reviewId) => `/games/${gameId}/codebooks/${codebookId}/training/tag/${reviewId}`}
        onChanged={load}
      />

      {training.phase === "calibrating" && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <h2 className="font-medium">Ready to move on?</h2>
          <p className="mt-1 text-xs text-gray-500">
            Revise and re-run calibration as many times as you like. When you&apos;re satisfied, move on to
            the test bucket — the {counts.test} reserved test review(s) will become blind-taggable.
          </p>
          <button
            type="button"
            onClick={handleAdvanceToTesting}
            disabled={advancing || counts.test === 0}
            className="mt-3 rounded-lg border border-gray-900 px-4 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {advancing ? "Advancing…" : "Move on to the test phase →"}
          </button>
          {counts.test === 0 && (
            <p className="mt-1 text-xs text-gray-500">No reviews were held out for testing — adjust the split next time.</p>
          )}
        </section>
      )}

      {training.phase !== "calibrating" && (
        <TrainingBucketPanel
        trainingId={training.id}
          stepStart={4}
          bucketLabel="test set"
          reviews={testReviews}
          taggings={taggings}
          codes={codes}
          tagHrefFor={(reviewId) => `/games/${gameId}/codebooks/${codebookId}/training/tag/${reviewId}`}
          nudge={TEST_NUDGE}
          onChanged={load}
        />
      )}

      {training.phase === "testing" && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <h2 className="font-medium">Lock for validation</h2>
          <p className="mt-1 text-xs text-gray-500">
            Stops further codebook edits and revisions. This can&apos;t be undone — a failed
            verification later means starting a fresh training, not reopening this one.
          </p>
          <button
            type="button"
            onClick={handleLock}
            disabled={locking}
            className="mt-3 rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {locking ? "Locking…" : "Lock codebook for validation →"}
          </button>
        </section>
      )}

      {isLocked && (
        <TrainingBucketPanel
        trainingId={training.id}
          stepStart={7}
          bucketLabel="verification set"
          reviews={verificationReviews}
          taggings={taggings}
          codes={codes}
          tagHrefFor={(reviewId) => `/games/${gameId}/codebooks/${codebookId}/training/tag/${reviewId}`}
          onChanged={load}
        />
      )}

      {training.phase === "locked" && (() => {
        const verifStats = computeBucketStats(verificationReviews, taggings, codes);
        const readyToVerify =
          counts.verification === 0 ||
          (verifStats.readyForAiPass.length === 0 && verifStats.mismatches.length === verificationReviews.length);
        return (
          <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <h2 className="font-medium">Mark as verified</h2>
            <p className="mt-1 text-xs text-gray-500">
              {counts.verification === 0
                ? "No reviews were reserved for verification, so there's no held-out score for it — you can still finalize."
                : "Finish blind-tagging and running the AI on every verification review above before finalizing."}
              {" "}This is the one-time final check — once verified, every held-out review rejoins the
              normal Reviews list and becomes taggable through AI-Assisted Coding again.
            </p>
            <button
              type="button"
              onClick={handleMarkVerified}
              disabled={verifying || !readyToVerify}
              className="mt-3 rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {verifying ? "Finalizing…" : "Mark training as verified →"}
            </button>
          </section>
        );
      })()}

      {training.phase === "verified" && (() => {
        const calibStats = computeBucketStats(calibrationReviews, taggings, codes);
        const testStats = computeBucketStats(testReviews, taggings, codes);
        const verifStats = computeBucketStats(verificationReviews, taggings, codes);
        const rows: { label: string; count: number; kappa: number | null | undefined }[] = [
          { label: "Calibration", count: calibrationReviews.length, kappa: calibStats.reliability?.kappa },
          { label: "Test", count: testReviews.length, kappa: testStats.reliability?.kappa },
          { label: "Verification", count: verificationReviews.length, kappa: verifStats.reliability?.kappa },
        ];
        return (
          <section className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <h2 className="font-medium">Final split summary</h2>
            <p className="mt-1 text-xs text-gray-500">The full progression of this training, now that it&apos;s verified.</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-lg border border-gray-100 p-2">
                  <span>
                    {r.label} <span className="text-xs text-gray-500">({r.count} review(s))</span>
                  </span>
                  <span className="text-xs text-gray-600">
                    {r.kappa === undefined
                      ? "no comparison yet"
                      : r.kappa === null
                        ? "κ undefined (perfect agreement, no variance)"
                        : `κ = ${r.kappa.toFixed(3)} (${interpretKappa(r.kappa)})`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })()}

      {training.phase === "verified" && (
        <AutoCodeRestPanel training={training} gameIds={[gameId]} codebookId={codebookId} codes={codes} />
      )}
    </main>
  );
}
