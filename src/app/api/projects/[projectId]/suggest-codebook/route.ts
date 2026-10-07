// Project-scoped counterpart of /api/games/[gameId]/suggest-codebook — same
// handler, same rate-limit bucket (per-IP, not per-project). See
// handleSuggestCodebook for the shared logic.
export { handleSuggestCodebook as POST } from "@/lib/api/suggestCodebookHandler";
