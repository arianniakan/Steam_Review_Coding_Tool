"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateCodebookPrompt } from "@/lib/localDb/queries/codebooks";
import { DEFAULT_SUGGEST_CODES_SYSTEM_PROMPT, MAX_SYSTEM_PROMPT_CHARS } from "@/lib/prompts";

// The paper's core procedure (Figure 1, Step 4) treats "revise codebook"
// and "revise prompt" as two equally-weighted levers in the same loop —
// this gives the prompt the exact same edit/lock lifecycle CodeManager
// already gives codes, rather than leaving it a hidden, unreadable constant.
export function CodebookPromptEditor({
  codebookId,
  promptOverride,
  locked,
  onSaved,
}: {
  codebookId: string;
  promptOverride: string | null;
  locked: boolean;
  onSaved: (promptOverride: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(promptOverride ?? DEFAULT_SUGGEST_CODES_SYSTEM_PROMPT);
  const [saving, setSaving] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const effectivePrompt = promptOverride ?? DEFAULT_SUGGEST_CODES_SYSTEM_PROMPT;
  const overLimit = draft.length > MAX_SYSTEM_PROMPT_CHARS;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateCodebookPrompt(codebookId, draft.trim() || null);
      onSaved(updated.promptOverride);
      setEditing(false);
      toast.success("Saved the custom prompt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToDefault() {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCodebookPrompt(codebookId, null);
      onSaved(updated.promptOverride);
      setDraft(DEFAULT_SUGGEST_CODES_SYSTEM_PROMPT);
      setEditing(false);
      toast.success("Reset to the default prompt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
      setConfirmingReset(false);
    }
  }

  return (
    <div className="mt-6">
      <p className="font-medium text-sm">AI prompt</p>
      {locked && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          This codebook is locked for validation — the prompt can&apos;t be edited. Start a fresh
          training to make further changes.
        </p>
      )}

      {editing && !locked ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className={`rounded border p-2 font-mono text-xs ${
              overLimit ? "border-red-400" : "border-gray-300"
            }`}
          />
          <p className={`text-xs ${overLimit ? "text-red-600" : "text-gray-400"}`}>
            {draft.length.toLocaleString()} / {MAX_SYSTEM_PROMPT_CHARS.toLocaleString()} characters
            {overLimit && " — too long, trim before saving"}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || overLimit}
              className="rounded-lg bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(effectivePrompt);
                setEditing(false);
              }}
              className="text-xs underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-gray-500">
            {promptOverride ? "Customized" : "Default"} — this is the exact system prompt sent with
            every AI suggestion request for this codebook (calibration/test/verification, bulk
            auto-code, and regular AI-Assisted Coding all use it).
          </p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            {effectivePrompt}
          </pre>
          {!locked && (
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(effectivePrompt);
                  setEditing(true);
                }}
                className="text-xs underline"
              >
                Edit prompt →
              </button>
              {promptOverride &&
                (confirmingReset ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Discard the custom prompt?</span>
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      disabled={saving}
                      className="text-red-600 underline disabled:opacity-50"
                    >
                      {saving ? "Resetting…" : "Yes, reset"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(false)}
                      disabled={saving}
                      className="text-gray-500 underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    className="text-xs text-gray-500 underline"
                  >
                    Reset to default
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
