import { describe, expect, it } from "vitest";
import { locateTargets, resolveLocations, spanMatches } from "@/lib/locate";

const slice = (t: string, s: { start: number; end: number } | null) => (s ? t.slice(s.start, s.end) : null);

describe("locateTargets", () => {
  const text = "Je pense que il est là. Mais je pense que il pleut aussi. Il y a beaucoup des gens.";

  it("uses the quoted sentence to pick the right occurrence of a repeated excerpt", () => {
    const [a] = locateTargets(text, [{ excerpt: "que il", context: "Mais je pense que il pleut aussi." }]);
    expect(a).not.toBeNull();
    expect(a!.start).toBeGreaterThan(text.indexOf("Mais"));
    expect(slice(text, a)).toBe("que il");
  });

  it("maps repeated excerpts without context to successive occurrences", () => {
    const [a, b] = locateTargets(text, [{ excerpt: "que il" }, { excerpt: "que il" }]);
    expect(a!.start).toBeLessThan(b!.start);
    expect(slice(text, a)).toBe("que il");
    expect(slice(text, b)).toBe("que il");
  });

  it("tolerates curly apostrophes, guillemets, spacing and case", () => {
    const t = "Il m’a dit « bonjour » ce matin.";
    expect(slice(t, locateTargets(t, [{ excerpt: "M'a   dit" }])[0])).toBe("m’a dit");
    // French guillemets carry inner spaces, so a model quoting "bonjour" matches via the
    // punctuation-trimmed fallback: the highlighted passage is the same word.
    expect(slice(t, locateTargets(t, [{ excerpt: '"bonjour"' }])[0])).toBe("bonjour");
    expect(slice(t, locateTargets(t, [{ excerpt: "« bonjour »" }])[0])).toBe("« bonjour »");
  });

  it("tolerates a trailing full stop added or dropped by the model", () => {
    const t = "Elles étaient très belles. Fin";
    expect(slice(t, locateTargets(t, [{ excerpt: "Fin." }])[0])).toBe("Fin");
  });

  it("returns null instead of attaching to the wrong sentence", () => {
    // The excerpt exists elsewhere, but not in the sentence the model quoted.
    const [a] = locateTargets(text, [{ excerpt: "beaucoup des", context: "Je pense que il est là." }]);
    expect(a).toBeNull();
  });

  it("returns null when the excerpt does not exist", () => {
    expect(locateTargets(text, [{ excerpt: "n'existe pas" }])).toEqual([null]);
    expect(locateTargets(text, [{ excerpt: "  " }])).toEqual([null]);
  });

  it("locates the Boggle example inside its sentence", () => {
    const t = "Hier, j'ai mangé. Maintenant je suis avec mes amis et ont joue du boggle dans la tele.";
    const [s] = locateTargets(t, [
      { excerpt: "ont joue", context: "Maintenant je suis avec mes amis et ont joue du boggle dans la tele." },
    ]);
    expect(slice(t, s)).toBe("ont joue");
  });
});

describe("spanMatches / resolveLocations", () => {
  const text = "Je suis allé à le marché.";
  const result = {
    summary: "",
    issues: [{ original: "à le", corrected: "au", sentence: text } as never],
  };

  it("keeps stored offsets that still match the text", () => {
    const stored = { ...result, locations: [{ start: 13, end: 17 }] };
    expect(resolveLocations(text, "grammar", stored)).toEqual([{ start: 13, end: 17 }]);
  });

  it("recomputes when stored offsets point at the wrong passage", () => {
    const stored = { ...result, locations: [{ start: 0, end: 4 }] };
    const [s] = resolveLocations(text, "grammar", stored);
    expect(text.slice(s!.start, s!.end)).toBe("à le");
  });

  it("recomputes for analyses saved without locations", () => {
    const [s] = resolveLocations(text, "grammar", result);
    expect(text.slice(s!.start, s!.end)).toBe("à le");
  });

  it("rejects out-of-range or empty spans", () => {
    expect(spanMatches(text, { start: -1, end: 3 }, "Je")).toBe(false);
    expect(spanMatches(text, { start: 3, end: 3 }, "")).toBe(false);
    expect(spanMatches(text, { start: 0, end: 999 }, text)).toBe(false);
  });
});
