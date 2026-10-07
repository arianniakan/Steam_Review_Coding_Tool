// Stateless AI proxy — sampling (which reviews, how many, balanced by
// recommended/not, hand-picked, etc.) happens entirely client-side against
// the local database (see sampleReviewsForCodebook in
// src/lib/localDb/queries/reviews.ts). This route just takes the resulting
// texts and asks OpenAI to propose a codebook from them. The [gameId]
// segment isn't read here — rate limiting is per-IP, not per-game — see
// handleSuggestCodebook, shared with the project-scoped variant of this route.
export { handleSuggestCodebook as POST } from "@/lib/api/suggestCodebookHandler";
