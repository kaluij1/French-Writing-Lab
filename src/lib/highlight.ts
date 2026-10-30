export type Range = { start: number; end: number; index: number };

const norm = (s: string) => s.replace(/[’‘`]/g, "'").replace(/[«»“”]/g, '"').toLowerCase();

/**
 * Locate each excerpt in the text and return non-overlapping ranges.
 * Matching is tolerant of apostrophe/quote styles, case and whitespace runs,
 * and repeated excerpts map to successive occurrences.
 */
export function findRanges(text: string, excerpts: string[]): Range[] {
  const hay = norm(text);
  const ranges: Range[] = [];
  const lastEnd = new Map<string, number>();

  excerpts.forEach((raw, index) => {
    const needle = norm(raw.trim());
    if (!needle) return;
    const from = lastEnd.get(needle) ?? 0;
    let hit = locate(hay, needle, from) ?? locate(hay, needle, 0);
    if (!hit) {
      // Fall back to a whitespace-insensitive match.
      const pattern = new RegExp(needle.split(/\s+/).map(escapeRe).join("\\s+"), "g");
      pattern.lastIndex = from;
      const m = pattern.exec(hay) ?? ((pattern.lastIndex = 0), pattern.exec(hay));
      if (m) hit = { start: m.index, end: m.index + m[0].length };
    }
    if (!hit) return;
    lastEnd.set(needle, hit.end);
    if (ranges.some((r) => hit!.start < r.end && r.start < hit!.end)) return;
    ranges.push({ ...hit, index });
  });

  return ranges.sort((a, b) => a.start - b.start);
}

function locate(hay: string, needle: string, from: number) {
  const i = hay.indexOf(needle, from);
  return i < 0 ? null : { start: i, end: i + needle.length };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
