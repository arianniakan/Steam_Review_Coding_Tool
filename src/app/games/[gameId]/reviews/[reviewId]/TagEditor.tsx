"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildHighlightSegments } from "@/lib/highlightSpans";
import { createTagging, deleteTagging } from "@/lib/localDb/queries/taggings";
import { getDefaultResearcher, getAiCoder } from "@/lib/localDb/queries/coders";
import {
  parseRateLimitHeaders,
  fetchRateLimitStatus,
  formatResetIn,
  type RateLimitQuota,
} from "@/lib/rateLimitClient";

interface Code {
  id: string;
  label: string;
  description: string;
  color: string;
  parentCodeId: string | null;
}

interface TaggingView {
  id: string;
  spanStart: number | null;
  spanEnd: number | null;
  memo: string | null;
  aiConfidence: number | null;
  aiRationale: string | null;
  code: { id: string; label: string; color: string };
  coder: { name: string; kind: "HUMAN" | "AI" };
}

interface Suggestion {
  codeId: string;
  codeLabel: string;
  color: string;
  spanText: string;
  spanStart: number | null;
  spanEnd: number | null;
  rationale: string;
  confidence: number;
}

interface TextSelection {
  start: number;
  end: number;
  text: string;
}

// Converts the browser's live Selection into character offsets relative to
// `container`'s full text content (via Range.toString().length), rather than
// assuming the selection sits in a single text node — works regardless of
// how the container's DOM is structured.
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

function toTaggingView(t: {
  id: string;
  spanStart: number | null;
  spanEnd: number | null;
  memo: string | null;
  aiConfidence: number | null;
  aiRationale: string | null;
  codeId: string;
  codeLabel: string;
  codeColor: string;
  coderName: string;
  coderKind: "HUMAN" | "AI";
}): TaggingView {
  return {
    id: t.id,
    spanStart: t.spanStart,
    spanEnd: t.spanEnd,
    memo: t.memo,
    aiConfidence: t.aiConfidence,
    aiRationale: t.aiRationale,
    code: { id: t.codeId, label: t.codeLabel, color: t.codeColor },
    coder: { name: t.coderName, kind: t.coderKind },
  };
}

export function TagEditor({
  reviewId,
  reviewText,
  codes,
  initialTaggings,
}: {
  reviewId: string;
  reviewText: string;
  codebookId: string;
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

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [quota, setQuota] = useState<RateLimitQuota | null>(null);

  useEffect(() => {
    fetchRateLimitStatus().then((status) => {
      if (status) setQuota(status.suggestCodes);
    });
  }, []);

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
      setTaggings((prev) => [toTaggingView(created), ...prev]);
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
    setError(null);
    try {
      await deleteTagging(taggingId);
      setTaggings((prev) => prev.filter((t) => t.id !== taggingId));
      toast.success("Tagging deleted");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleGetSuggestions() {
    setLoadingSuggestions(true);
    setSuggestError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/suggest-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewText, codes }),
      });
      const rateLimitQuota = parseRateLimitHeaders(res);
      if (rateLimitQuota) setQuota(rateLimitQuota);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && rateLimitQuota) {
          throw new Error(`AI suggestion limit reached — resets ${formatResetIn(rateLimitQuota.reset)}`);
        }
        throw new Error(data.error ?? "Failed to get AI suggestions");
      }
      setSuggestions(data.suggestions);
      toast.success(
        data.suggestions.length > 0
          ? `${data.suggestions.length} suggestion${data.suggestions.length === 1 ? "" : "s"} from AI`
          : "AI found no suggestions for this review",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setSuggestError(message);
      toast.error(message);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  const highlightSegments = useMemo(
    () => buildHighlightSegments(reviewText, taggings),
    [reviewText, taggings],
  );

  function suggestionKey(s: Suggestion) {
    return `${s.codeId}:${s.spanText}`;
  }

  // Suggestions are never written to the database on their own — the model
  // only ever reaches storage via this same POST, exactly like a manual tag,
  // just attributed to the AI coder with its rationale/confidence attached.
  async function handleAcceptSuggestion(s: Suggestion) {
    const key = suggestionKey(s);
    setResolvingKey(key);
    setSuggestError(null);
    try {
      const coder = await getAiCoder();
      const created = await createTagging({
        reviewId,
        codeId: s.codeId,
        coderId: coder.id,
        spanStart: s.spanStart,
        spanEnd: s.spanEnd,
        memo: null,
        aiConfidence: s.confidence,
        aiRationale: s.rationale,
      });
      setTaggings((prev) => [toTaggingView(created), ...prev]);
      setSuggestions((prev) => prev.filter((x) => suggestionKey(x) !== key));
      toast.success(`Accepted AI suggestion "${created.codeLabel}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setSuggestError(message);
      toast.error(message);
    } finally {
      setResolvingKey(null);
    }
  }

  function handleRejectSuggestion(s: Suggestion) {
    setSuggestions((prev) => prev.filter((x) => suggestionKey(x) !== suggestionKey(s)));
    toast(`Rejected "${s.codeLabel}"`);
  }

  return (
    <div className="mt-6">
      <p
        ref={textRef}
        onMouseUp={handleMouseUp}
        className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-white shadow-sm p-4 text-sm leading-relaxed"
      >
        {highlightSegments.map((seg, i) =>
          seg.color ? (
            <mark
              key={i}
              title={seg.label ?? undefined}
              style={{ backgroundColor: seg.color + "55" }}
            >
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
              Tag selection:{" "}
              <span className="italic">
                &ldquo;
                {selection.text.length > 80
                  ? selection.text.slice(0, 80) + "…"
                  : selection.text}
                &rdquo;
              </span>
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
          {codes.length === 0 && (
            <p className="text-gray-500">No codes in this codebook yet.</p>
          )}
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

      <div className="mt-4 rounded border border-dashed border-gray-300 p-4 text-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium">AI-assisted suggestions</p>
          <button
            type="button"
            onClick={handleGetSuggestions}
            disabled={loadingSuggestions || codes.length === 0}
            className="rounded border border-gray-400 px-3 py-1 text-xs disabled:opacity-50"
          >
            {loadingSuggestions ? "Asking…" : "Get AI suggestions"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Suggestions are never applied automatically — accept or reject each one below.
        </p>
        {quota && quota.reset > 0 && (
          <p
            className={`mt-1 text-xs ${quota.remaining <= 2 ? "text-amber-600" : "text-gray-400"}`}
          >
            {quota.remaining}/{quota.limit} AI requests left this hour
            {quota.remaining === 0 ? ` — resets ${formatResetIn(quota.reset)}` : ""}
          </p>
        )}
        {suggestError && <p className="mt-2 text-red-600">{suggestError}</p>}

        {suggestions.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {suggestions.map((s) => {
              const key = suggestionKey(s);
              return (
                <li key={key} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="font-medium">{s.codeLabel}</span>
                    <span className="text-xs text-gray-500">
                      {Math.round(s.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="mt-1 text-xs italic text-gray-500">
                    &ldquo;{s.spanText}&rdquo;
                  </p>
                  <p className="mt-1 text-gray-600">{s.rationale}</p>
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleAcceptSuggestion(s)}
                      disabled={resolvingKey === key}
                      className="rounded-lg bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
                    >
                      {resolvingKey === key ? "Accepting…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectSuggestion(s)}
                      className="text-xs text-red-600 underline"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium">Taggings ({taggings.length})</p>
        <ul className="mt-2 flex flex-col gap-2">
          {taggings.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white shadow-sm p-3 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: t.code.color }}
                  />
                  <span className="font-medium">{t.code.label}</span>
                  <span className="text-xs text-gray-500">
                    by {t.coder.name}
                    {t.coder.kind === "AI" && t.aiConfidence !== null
                      ? ` (${Math.round(t.aiConfidence * 100)}% confidence)`
                      : ""}
                  </span>
                </div>
                {t.spanStart !== null && t.spanEnd !== null && (
                  <p className="mt-1 text-xs italic text-gray-500">
                    &ldquo;{reviewText.slice(t.spanStart, t.spanEnd)}&rdquo;
                  </p>
                )}
                {t.memo && <p className="mt-1 text-gray-600">{t.memo}</p>}
                {t.aiRationale && (
                  <p className="mt-1 text-gray-600">{t.aiRationale}</p>
                )}
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
          {taggings.length === 0 && (
            <li className="text-sm text-gray-500">No taggings yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
