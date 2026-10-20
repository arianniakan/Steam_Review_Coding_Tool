// This is a local-first app — every game/review/codebook/tagging lives only
// in this one browser's IndexedDB, with no account and no cloud backup.
// Clearing site data (or just never clicking "Save project") silently loses
// everything. Tracked by Tagging count rather than a timer, since that's
// the actual unit of work a researcher would be upset to lose.
const LAST_SAVED_COUNT_KEY = "save-reminder:last-saved-count";
const SNOOZE_UNTIL_COUNT_KEY = "save-reminder:snooze-until-count";
const REMINDER_THRESHOLD = 15;

function readCount(key: string): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(key)) || 0;
}

export function getLastSavedCount(): number {
  return readCount(LAST_SAVED_COUNT_KEY);
}

// Called both by the reminder banner's own "Save project now" and by the
// header's "Save project" button, so saving through either path resets the
// same threshold.
export function recordProjectSaved(currentTaggingCount: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_SAVED_COUNT_KEY, String(currentTaggingCount));
}

export function snoozeReminder(currentTaggingCount: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SNOOZE_UNTIL_COUNT_KEY, String(currentTaggingCount + REMINDER_THRESHOLD));
}

export function shouldShowSaveReminder(currentTaggingCount: number): boolean {
  const lastSaved = readCount(LAST_SAVED_COUNT_KEY);
  const snoozeUntil = readCount(SNOOZE_UNTIL_COUNT_KEY);
  return currentTaggingCount - lastSaved >= REMINDER_THRESHOLD && currentTaggingCount >= snoozeUntil;
}
