import type { TrainingPhase } from "@/lib/localDb/queries/training";

const STEPS: { phase: TrainingPhase; label: string }[] = [
  { phase: "calibrating", label: "Calibrate" },
  { phase: "testing", label: "Test" },
  { phase: "locked", label: "Lock" },
  { phase: "verified", label: "Verify & auto-code" },
];

// The training flow is the app's most-complex surface (5+ sequential
// sections of body copy) and had the least wayfinding — this gives a
// one-glance answer to "which of the N steps am I on" without reading
// paragraphs.
export function TrainingSteps({ phase }: { phase: TrainingPhase }) {
  const currentIndex = STEPS.findIndex((s) => s.phase === phase);

  return (
    <>
      {/* Labels hidden below sm: 4 full labels (one as long as "Verify &
          auto-code") don't fit a narrow screen even unwrapped, and wrapping
          a connected stepper mid-step reads worse than just losing the
          labels — the current step's name is repeated as plain text below
          instead, so nothing is actually lost on mobile. */}
      <ol className="mt-3 flex items-center gap-1 text-xs">
        {STEPS.map((s, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={s.phase} className="flex flex-1 items-center gap-1">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  current
                    ? "bg-black text-white"
                    : done
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`hidden sm:inline ${current ? "font-medium text-black" : "text-gray-400"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px flex-1 bg-gray-200" />}
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-xs font-medium text-black sm:hidden">
        Step {currentIndex + 1} of {STEPS.length}: {STEPS[currentIndex]?.label}
      </p>
    </>
  );
}
