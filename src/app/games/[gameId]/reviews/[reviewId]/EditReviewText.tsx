"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  updateReviewText,
  revertReviewToOriginal,
  countTaggingsForReview,
  type Review,
} from "@/lib/localDb/queries/reviews";

// Mirrors CodebookPromptEditor's editing/state shape for consistency across
// the app's few free-text edit surfaces.
export function EditReviewText({
  review,
  onUpdated,
}: {
  review: Review;
  onUpdated: (review: Review) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.text);
  const [saving, setSaving] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  const [spanWarning, setSpanWarning] = useState(false);

  async function handleEditClick() {
    setDraft(review.text);
    // Tagging.spanStart/spanEnd are character offsets into the review text
    // at the time they were created — editing the text can silently
    // misalign existing highlights, so warn before the textarea even opens
    // if there's anything to lose.
    const taggingCount = await countTaggingsForReview(review.id);
    setSpanWarning(taggingCount > 0);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateReviewText(review.id, draft.trim());
      onUpdated(updated);
      setEditing(false);
      toast.success("Saved — original text preserved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    if (!confirmingRevert) {
      setConfirmingRevert(true);
      return;
    }
    setSaving(true);
    try {
      const updated = await revertReviewToOriginal(review.id);
      onUpdated(updated);
      setShowOriginal(false);
      toast.success("Reverted to the original text");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
      setConfirmingRevert(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white shadow-sm p-4">
        {spanWarning && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            This review has existing tagging(s) — editing its text may make their highlighted
            spans point to the wrong text.
          </p>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          className="whitespace-pre-wrap rounded border border-gray-300 p-2 text-sm leading-relaxed"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="text-xs underline disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-3 text-xs">
      <button type="button" onClick={handleEditClick} className="underline">
        Edit text →
      </button>
      {review.originalText !== null && (
        <button type="button" onClick={() => setShowOriginal((v) => !v)} className="text-gray-500 underline">
          {showOriginal ? "Hide original" : "Edited — view original"}
        </button>
      )}
      {showOriginal && review.originalText !== null && (
        <div className="mt-2 w-full basis-full rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="whitespace-pre-wrap text-gray-600">{review.originalText}</p>
          {confirmingRevert ? (
            <span className="mt-2 flex items-center gap-2">
              <span className="text-red-700">Revert to this original text?</span>
              <button type="button" onClick={handleRevert} disabled={saving} className="font-medium text-red-700 underline disabled:opacity-50">
                {saving ? "Reverting…" : "Yes, revert"}
              </button>
              <button type="button" onClick={() => setConfirmingRevert(false)} className="text-gray-500 underline">
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={handleRevert} className="mt-2 text-red-600 underline">
              Revert to original →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
