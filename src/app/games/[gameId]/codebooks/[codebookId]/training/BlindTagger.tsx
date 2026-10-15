"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { buildHighlightSegments } from "@/lib/highlightSpans";
import { createTagging, deleteTagging } from "@/lib/localDb/queries/taggings";
import { getDefaultResearcher } from "@/lib/localDb/queries/coders";

interface Code {
  id: string;
  label: string;
  description: string;
  color: string;
}

interface TaggingView {
  id: string;
  spanStart: number | null;
  spanEnd: number | null;
  memo: string | null;
  code: { id: string; label: string; color: string };
}

interface TextSelection {
  start: number;
  end: number;
  text: string;
}

// Same offset-computation approach as TagEditor's getSelectionWithinContainer
// — duplicated rather than imported, since this component is deliberately
// not sharing TagEditor's module at all (see training plan's "separate
// feature" rationale: no accidental path back to an AI-suggestions import).
function getSelectionWithinContainer(container: HTMLElement): TextSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const text = range.toString();
  if (!text) return null;
  return { start, end: start + text.length, text };
}

// The entire point of this component is what it does NOT have: no "Get AI
// suggestions" button, no suggestion panel, no model output of any kind.
// Blind calibration/test/verification tagging must happen with nothing but
// the codebook in front of the researcher — see the training plan's
// "blind-then-compare, not interleaved" rationale.
export function BlindTagger({
  reviewId,
  reviewText,
  codes,
  initialTaggings,
}: {
  reviewId: string;
  reviewText: string;
  codes: Code[];
  initialTaggings: TaggingView[];
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [codeId, setCodeId] = useState("");
  const [memo, setMemo] = useState("");
  const [taggings, setTaggings] = useState(initialTaggings);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleMouseUp() {
    if (!textRef.current) return;
    setSelection(getSelectionWithinContainer(textRef.current));
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!codeId) {
      setError("Choose a code to apply");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const coder = await getDefaultResearcher();
      const created = await createTagging({
        reviewId,
        codeId,
        coderId: coder.id,
        spanStart: selection?.start ?? null,
        spanEnd: selection?.end ?? null,
        memo: memo || null,
        aiConfidence: null,
        aiRationale: null,
      });
      setTaggings((prev) => [
        {
          id: created.id,
          spanStart: created.spanStart,
          spanEnd: created.spanEnd,
          memo: created.memo,
          code: { id: created.codeId, label: created.codeLabel, color: created.codeColor },
        },
        ...prev,
      ]);
      setMemo("");
      setCodeId("");
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      toast.success(`Tagged "${created.codeLabel}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(taggingId: string) {
    setDeletingId(taggingId);
    try {
      await deleteTagging(taggingId);
      setTaggings((prev) => prev.filter((t) => t.id !== taggingId));
      toast.success("Tagging deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeletingId(null);
    }
  }

  const highlightSegments = buildHighlightSegments(reviewText, taggings);

  return (
    <div className="mt-4">
      <p
        ref={textRef}
        onMouseUp={handleMouseUp}
        className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm leading-relaxed"
      >
        {highlightSegments.map((seg, i) =>
          seg.color ? (
            <mark key={i} title={seg.label ?? undefined} style={{ backgroundColor: seg.color + "55" }}>
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>

      <form
        onSubmit={handleApply}
        className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm"
      >
        <p className="font-medium">
          {selection ? (
            <>
              Tag selection: <span className="italic">&ldquo;{selection.text.slice(0, 80)}&rdquo;</span>
            </>
          ) : (
            "No text selected — tag will apply to the whole review"
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {codes.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCodeId(c.id)}
              title={c.description}
              className="rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: c.color,
                backgroundColor: codeId === c.id ? c.color : "transparent",
                color: codeId === c.id ? "#fff" : "inherit",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span>Memo (optional)</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !codeId}
            className="self-start rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
          >
            {submitting ? "Applying…" : "Apply code"}
          </button>
          {selection && (
            <button
              type="button"
              onClick={() => {
                window.getSelection()?.removeAllRanges();
                setSelection(null);
              }}
              className="text-xs underline"
            >
              Clear selection
            </button>
          )}
        </div>
        {error && <p className="text-red-600">{error}</p>}
      </form>

      <div className="mt-4">
        <p className="text-sm font-medium">Your taggings ({taggings.length})</p>
        <ul className="mt-2 flex flex-col gap-2">
          {taggings.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white shadow-sm p-3 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.code.color }} />
                  <span className="font-medium">{t.code.label}</span>
                </div>
                {t.spanStart !== null && t.spanEnd !== null && (
                  <p className="mt-1 text-xs italic text-gray-500">
                    &ldquo;{reviewText.slice(t.spanStart, t.spanEnd)}&rdquo;
                  </p>
                )}
                {t.memo && <p className="mt-1 text-gray-600">{t.memo}</p>}
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={deletingId === t.id}
                className="shrink-0 text-xs text-red-600 underline disabled:opacity-50"
              >
                {deletingId === t.id ? "Deleting…" : "Delete"}
              </button>
            </li>
          ))}
          {taggings.length === 0 && <li className="text-sm text-gray-500">No taggings yet.</li>}
        </ul>
      </div>
    </div>
  );
}
