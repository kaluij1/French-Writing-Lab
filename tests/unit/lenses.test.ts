import { describe, expect, it } from "vitest";
import { runDemoAnalysis } from "@/lib/analysis/demo";
import { buildUserPrompt } from "@/lib/analysis/prompts";
import { LENS_SCHEMAS, LENSES, VOCAB_KINDS, GrammarResultSchema } from "@/lib/analysis/schemas";
import { z } from "zod";

const MIXED =
  "Hier, j'ai allé à le marché avec ma grandmother. Il était very crowded et il y avait beaucoup des gens. " +
  "Je pense que il est important de faire des choses. Si j'aurais le temps, je voyagerais. J'ai un ami. Il habite à Paris.";

describe("lens schemas", () => {
  it("convert to JSON Schema (required for structured outputs)", () => {
    for (const lens of LENSES) expect(() => z.toJSONSchema(LENS_SCHEMAS[lens])).not.toThrow();
  });

  it("Vocabulary can no longer report English words (Language Mixing owns them)", () => {
    expect(VOCAB_KINDS).not.toContain("english_word" as never);
    const bad = { summary: "", items: [{ kind: "english_word", original: "very", sentence: "", suggestion: "très", english: "", translation_type: "direct", explanation: "", example: "", alternatives: [] }] };
    expect(LENS_SCHEMAS.vocabulary.safeParse(bad).success).toBe(false);
  });

  it("Grammar requires a classification, sentence context and confidence", () => {
    const shape = Object.keys(GrammarResultSchema.shape.issues.element.shape);
    for (const f of ["kind", "category", "sentence", "confidence", "valid_alternatives", "interpretations"]) expect(shape).toContain(f);
  });
});

describe("demo analyzer output conforms to the schemas", () => {
  for (const lens of LENSES) {
    it(lens, () => {
      const result = runDemoAnalysis(MIXED, lens);
      const parsed = LENS_SCHEMAS[lens].safeParse(result);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    });
  }
});

describe("demo grammar classification (deterministic rules)", () => {
  const issues = runDemoAnalysis(MIXED, "grammar").issues;
  const by = (o: string) => issues.find((i) => i.original === o);

  it("classifies known errors", () => {
    expect(by("à le")?.category).toBe("article_preposition");
    expect(by("j'ai allé")?.category).toBe("conjugation");
    expect(by("Si j'aurais")?.category).toBe("conjugation");
    expect(by("que il")?.corrected).toBe("qu'il");
    expect(issues.every((i) => i.kind === "error")).toBe(true);
  });

  it("does not flag correct French", () => {
    for (const ok of [
      "Yvonne a gagné la première partie.",
      "C'était la deuxième manche, ou la seconde manche.",
      "Mon autre amie est arrivée.",
      "Maintenant, je suis avec mes amis et on joue au Boggle à la télé.",
    ]) {
      expect(runDemoAnalysis(ok, "grammar").issues, ok).toEqual([]);
    }
  });

  it("does not report English words as vocabulary", () => {
    const items = runDemoAnalysis(MIXED, "vocabulary").items;
    expect(items.map((i) => i.original.toLowerCase())).not.toContain("grandmother");
    expect(items.some((i) => (i.kind as string) === "english_word")).toBe(false);
  });

  it("reports English words in Language Mixing, but not loanwords", () => {
    const mix = runDemoAnalysis(MIXED + " Ce week-end, je vais au parking.", "mixing").insertions.map((i) => i.original);
    expect(mix).toEqual(expect.arrayContaining(["grandmother", "very crowded"]));
    expect(mix).not.toContain("week-end");
    expect(mix).not.toContain("parking");
  });
});

describe("prompts keep the lenses separate", () => {
  const p = (lens: (typeof LENSES)[number]) => buildUserPrompt("Bonjour.", lens);

  it("Vocabulary explicitly ignores English words", () => {
    expect(p("vocabulary")).toMatch(/Ignore every English word/);
    expect(p("vocabulary")).toMatch(/enrichment/);
  });

  it("Grammar reads context first, protects valid alternatives and separates spelling", () => {
    const g = p("grammar");
    expect(g).toMatch(/Never change the intended subject, tense or meaning/);
    expect(g).toMatch(/la seconde manche/);
    expect(g).toMatch(/mon autre amie/);
    expect(g).toMatch(/spelling_accent/);
    expect(g).toMatch(/ambiguous/);
    expect(g).toMatch(/on joue/);
  });

  it("Complexity does not force suggestions or reward length", () => {
    const c = p("complexity");
    expect(c).toMatch(/0–4 opportunities/);
    expect(c).toMatch(/Do not reward length/);
    expect(c).toMatch(/Never add ideas/);
  });

  it("the draft is fenced as data", () => {
    expect(p("grammar")).toMatch(/<draft>\nBonjour.\n<\/draft>/);
  });
});
