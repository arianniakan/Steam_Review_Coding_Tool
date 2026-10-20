import { getAiCoder } from "./localDb/queries/coders";
import { createTagging } from "./localDb/queries/taggings";
import { parseRateLimitHeaders, type RateLimitQuota } from "./rateLimitClient";

interface RawSuggestion {
  codeId: string;
  spanStart: number | null;
  spanEnd: number | null;
  rationale: string;
  confidence: number;
}

export interface IndependentPassResult {
  reviewId: string;
  taggingCount: number;
  error?: string;
  // Lets a batch-driving caller (TrainingBucketPanel, AutoCodeRestPanel) show
  // a live quota bar the same way TagEditor's single-call path already does,
  // instead of looping through a whole bucket with zero visibility into how
  // close it is to a 429.
  quota?: RateLimitQuota | null;
}

// Runs the AI on a review entirely on its own — no accept/reject step —
// writing every suggestion straight to Tagging as the AI coder. Reuses the
// exact same /api/reviews/[reviewId]/suggest-codes route Feature A's
// interactive suggest/accept/reject flow already calls; the only
// difference is what happens with the response. This is deliberate: during
// calibration/test/verification the point is measuring what the model
// does unsupervised, not what a human would choose to keep.
export async function runIndependentAiPass(
  reviewId: string,
  reviewText: string,
  codes: { id: string; label: string; description: string; color: string }[],
  systemPromptOverride?: string | null,
): Promise<IndependentPassResult> {
  try {
    const res = await fetch(`/api/reviews/${reviewId}/suggest-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewText, codes, systemPromptOverride: systemPromptOverride ?? undefined }),
    });
    const quota = parseRateLimitHeaders(res);
    const data = await res.json();
    if (!res.ok) {
      return { reviewId, taggingCount: 0, error: data.error ?? `Request failed (${res.status})`, quota };
    }

    const coder = await getAiCoder();
    const suggestions = data.suggestions as RawSuggestion[];
    for (const s of suggestions) {
      await createTagging({
        reviewId,
        codeId: s.codeId,
        coderId: coder.id,
        spanStart: s.spanStart,
        spanEnd: s.spanEnd,
        memo: null,
        aiConfidence: s.confidence,
        aiRationale: s.rationale,
      });
    }
    return { reviewId, taggingCount: suggestions.length, quota };
  } catch (err) {
    return {
      reviewId,
      taggingCount: 0,
      error: err instanceof Error ? err.message : "Something went wrong",
    };
  }
}
