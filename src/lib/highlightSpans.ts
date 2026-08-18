interface TaggingSpan {
  spanStart: number | null;
  spanEnd: number | null;
  code: { label: string; color: string };
}

export interface HighlightSegment {
  text: string;
  color: string | null;
  label: string | null;
}

// Builds highlight segments for a review's text from its taggings. Taggings
// are expected newest-first (as rendered in the taggings list) — iterating in
// that order and only writing unset slots means the most recently applied
// tag wins on overlapping spans, without needing separate sort logic.
export function buildHighlightSegments(
  text: string,
  taggings: TaggingSpan[],
): HighlightSegment[] {
  const colors: (string | null)[] = new Array(text.length).fill(null);
  const labels: (string | null)[] = new Array(text.length).fill(null);

  for (const t of taggings) {
    if (t.spanStart === null || t.spanEnd === null) continue;
    const start = Math.max(0, t.spanStart);
    const end = Math.min(text.length, t.spanEnd);
    for (let i = start; i < end; i++) {
      if (colors[i] === null) {
        colors[i] = t.code.color;
        labels[i] = t.code.label;
      }
    }
  }

  const segments: HighlightSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const color = colors[i];
    const label = labels[i];
    let j = i + 1;
    while (j < text.length && colors[j] === color) j++;
    segments.push({ text: text.slice(i, j), color, label });
    i = j;
  }
  return segments;
}
