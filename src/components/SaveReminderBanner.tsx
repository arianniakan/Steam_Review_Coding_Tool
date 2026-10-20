"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { countAllTaggings } from "@/lib/localDb/queries/taggings";
import { exportProject } from "@/lib/localDb/projectFile";
import {
  getLastSavedCount,
  recordProjectSaved,
  shouldShowSaveReminder,
  snoozeReminder,
} from "@/lib/saveReminder";

// The only data-loss safety net this local-first app had was a researcher
// remembering to click "Save project" on their own. This surfaces the same
// export action proactively once enough new taggings have piled up since
// the last save, rather than leaving it entirely to memory.
export function SaveReminderBanner() {
  const [count, setCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    countAllTaggings().then(setCount);
  }, []);

  if (count === null || dismissed || !shouldShowSaveReminder(count)) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await exportProject();
      recordProjectSaved(count!);
      toast.success("Project saved");
      setDismissed(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  function handleSnooze() {
    snoozeReminder(count!);
    setDismissed(true);
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-8 py-2 text-sm text-amber-800">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <span>
          {count - getLastSavedCount()} new tagging(s) since your last save — this app keeps
          everything only in this browser, with no cloud backup.
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="underline disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save project now"}
          </button>
          <button type="button" onClick={handleSnooze} className="text-amber-600 underline">
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}
