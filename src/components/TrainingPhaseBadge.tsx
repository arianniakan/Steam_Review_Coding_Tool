import type { TrainingPhase } from "@/lib/localDb/queries/training";

// Codebook lists previously showed name/version/code-count only — finding
// out whether a codebook was still editable (vs. locked/verified) meant
// clicking into each one. Same color scheme already used on the codebook
// detail and training pages, just surfaced one level up.
export function TrainingPhaseBadge({ phase }: { phase: TrainingPhase | null }) {
  if (phase === "verified") {
    return (
      <span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-800">
        Verified ✓
      </span>
    );
  }
  if (phase === "locked") {
    return (
      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
        Locked
      </span>
    );
  }
  if (phase === "calibrating" || phase === "testing") {
    return (
      <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
        {phase === "calibrating" ? "Calibrating" : "Testing"}
      </span>
    );
  }
  return null;
}
