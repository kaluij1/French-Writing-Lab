import type { Lens, LensResult, Span } from "@/lib/analysis/schemas";

/**
 * Maps the excerpts quoted by an analysis back to character offsets in the
 * analysed text.
 *
 * Models occasionally change quote marks, apostrophes, spacing or a trailing full
 * stop when they quote. Matching tolerates those differences, but never guesses:
 * when the quoted sentence is found and the excerpt is not inside it, or nothing
 * matches, the result is null and the UI says the passage could not be located.
 */

export type Target = { excerpt: string; context?: string };

const PUNCT_EDGES = /^[\s.,;:!?…"'()«»-]+|[\s.,;:!?…"'()«»-]+$/g;

/** Normalises without changing string length, so indices map 1:1 onto the original. */
export function normalize(s: string): string {
  const n = s
    .replace(/[’‘`´]/g, "'")
    .replace(/[«»“”„]/g, '"')
    .replace(/[   ]/g, " ");
  const lower = n.toLowerCase();
  return lower.length === n.length ? lower : n;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findAll(hay: string, needle: string): Span[] {
  const tokens = needle.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const re = new RegExp(tokens.map(escapeRe).join("\\s+"), "g");
  const out: Span[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay))) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/** Exact (whitespace-tolerant) match first, then without surrounding punctuation. */
function findVariants(hay: string, needle: string): Span[] {
  const n = normalize(needle);
  const exact = findAll(hay, n);
  if (exact.length) return exact;
  const trimmed = n.replace(PUNCT_EDGES, "");
  return trimmed && trimmed !== n.trim() ? findAll(hay, trimmed) : [];
}

const sameSpan = (a: Span, b: Span) => a.start === b.start && a.end === b.end;

export function locateTargets(text: string, targets: Target[]): (Span | null)[] {
  const hay = normalize(text);
  const claimed: Span[] = [];

  return targets.map(({ excerpt, context }) => {
    if (!excerpt?.trim()) return null;

    let candidates: Span[] = [];
    const contexts = context?.trim() ? findVariants(hay, context) : [];

    if (contexts.length) {
      for (const c of contexts) {
        const inside = findVariants(hay.slice(c.start, c.end), excerpt).map((s) => ({
          start: s.start + c.start,
          end: s.end + c.start,
        }));
        candidates.push(...inside);
      }
      // The sentence was found but the excerpt is not in it: do not attach it elsewhere.
      if (!candidates.length) return null;
    } else {
      candidates = findVariants(hay, excerpt);
    }
    if (!candidates.length) return null;

    // Repeated identical excerpts map to successive occurrences.
    const pick = candidates.find((c) => !claimed.some((k) => sameSpan(k, c))) ?? candidates[0];
    claimed.push(pick);
    return pick;
  });
}

/** True when `span` really covers `excerpt` in `text` (modulo the tolerated differences). */
export function spanMatches(text: string, span: Span, excerpt: string): boolean {
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) return false;
  if (span.start < 0 || span.end > text.length || span.start >= span.end) return false;
  const squash = (s: string) => normalize(s).replace(/\s+/g, " ").trim();
  const got = squash(text.slice(span.start, span.end));
  const want = squash(excerpt);
  return got === want || got === want.replace(PUNCT_EDGES, "");
}

export function targetsFor(lens: Lens, result: LensResult[Lens]): Target[] {
  switch (lens) {
    case "grammar":
      return (result as LensResult["grammar"]).issues.map((i) => ({ excerpt: i.original, context: i.sentence }));
    case "vocabulary":
      return (result as LensResult["vocabulary"]).items.map((i) => ({ excerpt: i.original, context: i.sentence }));
    case "mixing":
      return (result as LensResult["mixing"]).insertions.map((i) => ({ excerpt: i.original, context: i.sentence }));
    case "complexity":
      return (result as LensResult["complexity"]).opportunities.map((o) => ({ excerpt: o.original_sentence }));
  }
}

/**
 * Locations to display: stored server offsets when every one of them still checks
 * out against the text, otherwise freshly computed (older analyses have none).
 */
export function resolveLocations(text: string, lens: Lens, result: LensResult[Lens]): (Span | null)[] {
  const targets = targetsFor(lens, result);
  const stored = result.locations;
  if (
    stored &&
    stored.length === targets.length &&
    stored.every((s, i) => s === null || spanMatches(text, s, targets[i].excerpt))
  ) {
    return stored;
  }
  return locateTargets(text, targets);
}
