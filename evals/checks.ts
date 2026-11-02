import type { LensResult } from "../src/lib/analysis/schemas";
import type { ComplexityExpect, GrammarExpect, MixingExpect, VocabularyExpect } from "./fixtures";

export type CheckResult = { name: string; pass: boolean; detail?: string };

const has = (hay: string | undefined, needle: string) => (hay ?? "").toLowerCase().includes(needle.toLowerCase());

export function checkGrammar(r: LensResult["grammar"], e: GrammarExpect): CheckResult[] {
  const out: CheckResult[] = [];
  const errors = r.issues.filter((i) => (i.kind ?? "error") === "error");
  for (const f of e.mustFlag ?? []) {
    const hit = r.issues.find(
      (i) =>
        i.kind !== "style" &&
        has(i.original, f.excerpt) &&
        (!f.category || f.category.includes(i.category)) &&
        (!f.correctedIncludes || has(i.corrected, f.correctedIncludes)),
    );
    const near = r.issues.find((i) => has(i.original, f.excerpt));
    out.push({
      name: `flags "${f.excerpt}"${f.category ? ` as ${f.category.join("/")}` : ""}${f.correctedIncludes ? ` → "${f.correctedIncludes}"` : ""}`,
      pass: Boolean(hit),
      detail: hit ? undefined : near ? `found ${near.kind}/${near.category}: "${near.original}" → "${near.corrected}"` : "not reported",
    });
  }
  for (const x of e.mustNotFlagAsError ?? []) {
    const bad = errors.find((i) => has(i.original, x));
    out.push({ name: `does not mark "${x}" as an error`, pass: !bad, detail: bad && `"${bad.original}" → "${bad.corrected}" (${bad.category})` });
  }
  for (const re of e.forbiddenCorrection ?? []) {
    const bad = r.issues.find((i) => re.test(i.corrected));
    out.push({ name: `no correction matching ${re}`, pass: !bad, detail: bad && `"${bad.original}" → "${bad.corrected}"` });
  }
  for (const x of e.notConfidentErrorOn ?? []) {
    const bad = r.issues.find((i) => has(i.original, x) && (i.kind ?? "error") === "error" && i.confidence === "high");
    out.push({ name: `"${x}" not a high-confidence error`, pass: !bad, detail: bad && `"${bad.original}" → "${bad.corrected}"` });
  }
  if (e.maxErrors !== undefined) {
    out.push({
      name: `at most ${e.maxErrors} errors`,
      pass: errors.length <= e.maxErrors,
      detail: errors.length > e.maxErrors ? errors.map((i) => `"${i.original}" → "${i.corrected}" (${i.category})`).join("; ") : undefined,
    });
  }
  return out;
}

export function checkVocabulary(r: LensResult["vocabulary"], e: VocabularyExpect): CheckResult[] {
  const out: CheckResult[] = [];
  for (const w of e.mustNotMention ?? []) {
    const bad = r.items.find((i) => has(i.original, w));
    out.push({ name: `does not report English "${w}" (Mixing's job)`, pass: !bad, detail: bad && `${bad.kind}: "${bad.original}"` });
  }
  for (const f of e.mustFlag ?? []) {
    const hit = r.items.find((i) => has(i.original, f.excerpt) && f.kinds.includes(i.kind));
    const near = r.items.find((i) => has(i.original, f.excerpt));
    out.push({ name: `flags "${f.excerpt}" as ${f.kinds.join("/")}`, pass: Boolean(hit), detail: hit ? undefined : near ? `found as ${near.kind}` : "not reported" });
  }
  for (const x of e.notIncorrect ?? []) {
    const bad = r.items.find((i) => has(i.original, x) && i.kind === "incorrect_choice");
    out.push({ name: `"${x}" not called incorrect`, pass: !bad, detail: bad && `→ "${bad.suggestion}"` });
  }
  return out;
}

export function checkMixing(r: LensResult["mixing"], e: MixingExpect): CheckResult[] {
  const found = r.insertions.map((i) => i.original);
  return [
    ...(e.mustFind ?? []).map((w) => ({ name: `finds "${w}"`, pass: found.some((f) => has(f, w)), detail: `found: ${found.join(", ") || "none"}` })),
    ...(e.mustNotFind ?? []).map((w) => ({ name: `leaves "${w}" alone`, pass: !found.some((f) => has(f, w)) })),
  ];
}

const STOP = new Set("avec dans pour mais donc parce elle elles nous vous leur leurs tous tout toute toutes très plus aussi avait était sont suis cette celui quand alors comme".split(" "));
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const contentStems = (s: string) =>
  [...new Set((fold(s).match(/\p{L}{4,}/gu) ?? []).filter((w) => !STOP.has(w)).map((w) => w.slice(0, 4)))];

/** Share of the original's content-word stems kept by the suggestion: a rough meaning-preservation signal. */
export function keptRatio(original: string, suggestion: string): number {
  const want = contentStems(original);
  if (!want.length) return 1;
  const got = new Set(contentStems(suggestion));
  return want.filter((w) => got.has(w)).length / want.length;
}

export function checkComplexity(r: LensResult["complexity"], e: ComplexityExpect): CheckResult[] {
  const n = r.opportunities.length;
  const out: CheckResult[] = [];
  if (e.minOpportunities !== undefined) out.push({ name: `≥ ${e.minOpportunities} opportunities`, pass: n >= e.minOpportunities, detail: `got ${n}` });
  if (e.maxOpportunities !== undefined) out.push({ name: `≤ ${e.maxOpportunities} opportunities (no forced complexity)`, pass: n <= e.maxOpportunities, detail: `got ${n}` });
  if (e.minStrengths !== undefined) out.push({ name: `≥ ${e.minStrengths} strengths`, pass: r.strengths.length >= e.minStrengths, detail: `got ${r.strengths.length}` });
  r.opportunities.forEach((o, i) => {
    const k = keptRatio(o.original_sentence, o.suggestion);
    out.push({ name: `opportunity ${i + 1} keeps the learner's content words (≥ 70%)`, pass: k >= 0.7, detail: `${Math.round(k * 100)}% · "${o.suggestion}"` });
    out.push({ name: `opportunity ${i + 1} is an actual change`, pass: fold(o.suggestion).trim() !== fold(o.original_sentence).trim() });
  });
  return out;
}
