# Best Practices for Text Annotation with LLMs — In-App Implementation Plan

Source: Törnberg, P. (2024) "Best Practices for Text Annotation with Large Language Models."

This file holds only the items that belong **in the app itself** — things a researcher should be guided through, warned about, or have captured for them automatically while using the tool, rather than things they need to read/decide once outside the app. The other items (ethics/legal, model-choice rationale, documentation-only notes) live in [BEST_PRACTICES_NOTES.md](BEST_PRACTICES_NOTES.md).

**Goal:** a guided workflow that holds the researcher's hand through the paper's systematic coding procedure — surfacing the right nudge, warning, or gate at the right moment, instead of leaving best practice up to memory. Most of the items below aren't isolated features; they're pieces of one connected flow: **calibrate → code with guardrails → lock → validate → export with full provenance.**

**Highest-leverage first fixes** (small, mechanical, directly contradict the paper today):
- [x] #6 — pin `temperature: 0` explicitly in both OpenAI calls
- [x] #5 — alphabetize code options sent to the model

---

## A. The calibration → coding → validation loop (core hand-holding feature)
*(Paper section 2 — the systematic coding procedure)*

- [x] **Calibration mode ("Train & Auto-Code") — Phase B1**: new `/training` route (game- and project-scoped) draws a one-time random split (calibration sample + held-out test/verification pool, excluding reviews already tagged under this codebook), gates held-out reviews out of the normal AI-Assisted Coding flow entirely, provides a dedicated `BlindTagger` component with zero AI-suggestion UI, runs the AI independently (batch, direct-to-`Tagging`, no accept/reject step) via the existing `suggest-codes` route, and computes κ + a mismatch view over the calibration bucket. Revising the codebook mid-calibration carries the same split forward. Verified end-to-end in both scopes, including that the gating math (200 − 74 held out = 126 shown) and the equal per-game split (10+10) are exactly correct. Full design in `.claude/plans/snug-sleeping-goblet.md`.
- [x] **Calibration mode ("Train & Auto-Code") — Phase B2**: "Move on to the test phase →" transitions `CodebookTraining.phase` from `calibrating` to `testing`, revealing the reserved test bucket for the same blind-tag → independent-AI → compare pattern as calibration (factored into a shared `TrainingBucketPanel` used by both buckets and both scopes), with a persistent (non-blocking) nudge against repeated test-set loops. "Lock codebook for validation" sets `phase = 'locked'`, after which `createCode`/`updateCode`/`deleteCode` (`src/lib/localDb/queries/codes.ts`) throw `CodebookLockedError` and `CodeManager` hides its edit/add/delete controls behind a banner; the codebook detail page shows a "Locked for validation" badge in place of the Revise button (locking already blocked revision via the existing `reviseCodebook` check). Verified end-to-end in both scopes: advancing phase reveals the test bucket and count, locking disables code edits immediately, and the newer-version link still takes priority over the locked badge when a revision exists.
- [x] **Calibration mode ("Train & Auto-Code") — Phase B3**: once locked, the verification bucket renders through the same `TrainingBucketPanel`; "Mark training as verified →" is enabled only once every verification review has a human tag and the AI pass has been attempted on it (or immediately if nothing was reserved for verification). Marking verified sets `phase = 'verified'`, which — via already-shipped B1 logic — immediately lifts `getGatedReviewIds`' gating, so every calibration/test/verification review reappears in the normal Reviews list and is taggable through AI-Assisted Coding again; a "Final split summary" shows all three buckets' counts/κ together, the codebook detail page swaps its badge to "Verified ✓", and CSV export (`listTaggingsForCodebookExport`/`exportCodebookCsv`) gained a `training_bucket` column via a `ReviewSplitAssignment` join. **Real bug found and fixed during this work**: the independent AI pass legitimately returning zero codes for a review wrote no `Tagging` row, making "attempted, found nothing" indistinguishable from "never run" — this silently excluded such reviews from kappa's denominator and would have made the verified-completion gate permanently unsatisfiable the first time the model found nothing. Fixed by adding `ReviewSplitAssignment.aiAttemptedAt`, set whenever the independent pass completes without error regardless of suggestion count; `computeBucketStats` now treats "AI attempted" (not "AI produced a tagging") as the readiness/comparison signal. Verified end-to-end including this exact zero-suggestion scenario (6 of 14 verification reviews got real "no codes apply" responses, all correctly counted as disagreements in κ). Remaining: B4 (bulk auto-code the rest).
- [x] **Persist rejected AI suggestions** (`RejectedSuggestion` table + `createRejectedSuggestion`, wired into `TagEditor.handleRejectSuggestion`) — previously discarded client-side on reject; now captured with full span/confidence/rationale.
- [x] **Disagreement queue**: `/games/[gameId]/codebooks/[codebookId]/disagreements` and the project-scoped equivalent list every rejected suggestion (newest first), linked from `CodebookToolbar` with a live count badge. Verified end-to-end in both scopes, including game attribution in the project view.
- [ ] **"Ask the AI to motivate its decision"**: when a human tag and an AI suggestion disagree, re-send the review + the AI's original answer + a follow-up asking it to justify, and show both rationales side by side. (Lower priority now — the rationale is already captured and persisted at rejection time via the queue above, so most of this point's intent is already covered; this would add a deeper follow-up round-trip.)
- [x] **Explicit codebook revision action**: "Revise this codebook" (on the codebook detail page, both game- and project-scoped) copies the codebook forward into a new row — `version` bumped, `previousVersionId` set, codes (including parent/child hierarchy) copied with remapped ids. Old codebook's codes/taggings/disagreements stay untouched and independent. Version badges on both the list and detail pages; "↩ Revised from vN" / "A newer version exists →" links navigate the chain in both directions. Verified end-to-end in both scopes, including that editing/deleting codes on one version never touches the other.
- [ ] **Separate calibration-phase reliability from final validation**: Analytics currently pools everything into one kappa; track which taggings happened during calibration vs. after lock (ties to item in section C) and show both.

## B. Prompt & parameter transparency (reproducibility, captured automatically)
*(Paper sections 3 and 6)*

- [x] **Pin `temperature: 0`** explicitly in `suggest-codes/route.ts` and `suggestCodebookHandler.ts` — currently neither sets it, silently relying on OpenAI's default. Confirmed gap, one-line fix per route.
- [ ] **Store the model name/version** on `Tagging` (AI suggestions) and `Codebook` (AI-drafted codebooks) — captured automatically at creation time, not something the researcher has to remember to note down.
- [ ] **Persist the exact prompt text + parameters** used for an AI-drafted codebook on the `Codebook` row (currently built client-side and discarded after the request).
- [ ] **"View the exact prompt used" panel**: a read-only view (on the Codebook or Analytics page) showing the live system/user prompt template — transparency without digging into source code.
- [ ] **Export a "prompt codebook" document** alongside the existing CSV export: coding guideline + exact prompt template + all parameters (model, temperature, max_tokens) in one file.

## C. Validation guardrails (nudges and gates, not just a number)
*(Paper section 4)*

- [x] **"Lock codebook for validation" action**: shipped as part of Train & Auto-Code Phase B2 (section A) — sets `CodebookTraining.lockedAt`/`phase = 'locked'`, blocks further code edits and revisions. Not yet done: Analytics flagging whether a displayed kappa reflects pre- or post-lock taggings (the pooled-vs-split kappa item below covers this).
- [ ] **Per-code precision/recall/F1**, not just one pooled kappa — surfaced directly on the Analytics page next to the existing kappa gauge.
- [ ] **Validation-set-size warning banner**: flag on Analytics when any code has fewer than ~20 human-coded instances (the paper's practical floor), rather than letting a researcher trust a kappa built on 3 examples.
- [ ] **Per-language reliability breakdown**: same pattern as the per-game breakdown already shipped (`reviewGameId` on taggings) — add the same for `language`.
- [ ] **Failure examination view**: surface the reviews with the strongest human/AI disagreement so the researcher is nudged to actually read and characterize failure modes, not just glance at a score.

## D. Prompt engineering fixes
*(Paper section 5)*

- [x] **Alphabetize code options** sent to the model — confirmed gap in `suggest-codes/route.ts` (both the prompt's code list and the JSON-schema enum); `suggestCodebookHandler.ts` has no fixed code list to sort since it drafts new codes from scratch.
- [ ] **"Uncertain" option** in the suggestion schema, distinct from the existing `confidence` float — gives the model an explicit low-confidence path instead of forcing a guess.
- [ ] **Few-shot example support**: let a researcher attach 2–3 example (review → correct codes) pairs to a codebook.
- [ ] **Chain-of-Thought toggle** for harder codebooks.
- [ ] **"Use the LLM to improve this prompt"** feature in `AutoCodebookGenerator`.

## E. Stochasticity check
*(Paper section 8 — doesn't exist in the app at all today)*

- [ ] **Prompt stability panel**: run the same review through `suggest-codes` N times (or with paraphrased prompts) and report agreement across runs, so the researcher can spot-check reliability before trusting the model at scale, rather than assuming it.
