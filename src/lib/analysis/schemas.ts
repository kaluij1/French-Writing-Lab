import { z } from "zod";

/**
 * Structured-output schemas for each analysis lens.
 *
 * These Zod schemas are the single source of truth: they are converted to JSON
 * Schema and sent to Claude as the required output format, used to validate the
 * response, and used to derive the TypeScript types consumed by the UI.
 */

export const LENSES = ["grammar", "vocabulary", "mixing", "complexity"] as const;
export type Lens = (typeof LENSES)[number];

export const LENS_LABELS: Record<Lens, { title: string; blurb: string }> = {
  grammar: {
    title: "Grammar",
    blurb: "Genuine errors in conjugation, agreement, articles, prepositions and word order.",
  },
  vocabulary: {
    title: "Vocabulary",
    blurb: "Gaps, imprecise word choices, repetition and more exact expressions.",
  },
  mixing: {
    title: "Language mixing",
    blurb: "English words and phrases you wrote in place of French.",
  },
  complexity: {
    title: "Sentence complexity",
    blurb: "How you build sentences, and where a richer construction would serve you.",
  },
};

export const GRAMMAR_CATEGORIES = [
  "verb_conjugation",
  "tense",
  "agreement",
  "article",
  "preposition",
  "pronoun_placement",
  "sentence_construction",
  "word_order",
  "elision",
  "other",
] as const;

export const GrammarIssueSchema = z.object({
  original: z.string().describe("Exact excerpt copied verbatim from the learner's draft."),
  corrected: z.string().describe("The same excerpt, minimally corrected."),
  category: z.enum(GRAMMAR_CATEGORIES),
  explanation: z.string().describe("Clear explanation in English of why this is an error."),
  rule: z.string().describe("Name of the French grammar rule involved."),
  example: z.string().describe("A short, different French sentence showing correct usage."),
});

export const GrammarResultSchema = z.object({
  summary: z.string().describe("Two or three sentences in English giving an overall picture."),
  issues: z.array(GrammarIssueSchema),
});

export const VOCAB_KINDS = [
  "english_word",
  "incorrect_choice",
  "repetition",
  "more_precise",
] as const;

export const VocabularyItemSchema = z.object({
  kind: z.enum(VOCAB_KINDS),
  original: z.string().describe("Exact excerpt copied verbatim from the learner's draft."),
  suggestion: z.string().describe("Recommended French word or expression."),
  english: z.string().describe("Short English gloss of the suggestion."),
  translation_type: z
    .enum(["direct", "contextual"])
    .describe("direct = literal dictionary equivalent; contextual = idiomatic choice for this context."),
  explanation: z.string().describe("Why this word fits this context, in English."),
  example: z.string().describe("Example French sentence using the suggestion."),
  alternatives: z.array(z.string()).describe("Similar French expressions, possibly empty."),
});

export const VocabularyResultSchema = z.object({
  summary: z.string(),
  items: z.array(VocabularyItemSchema),
});

export const MixingItemSchema = z.object({
  original: z.string().describe("The English word or phrase, copied verbatim from the draft."),
  french: z.string().describe("Most appropriate French equivalent in this context."),
  sentence: z.string().describe("The learner's full sentence containing the English expression, verbatim."),
  rewritten_sentence: z
    .string()
    .describe("The learner's sentence with only the English expression replaced (and any agreement it forces)."),
  explanation: z.string().describe("Why this translation fits, in English."),
  example: z.string().describe("A different French example sentence using the expression."),
  alternatives: z.array(z.string()),
});

export const MixingResultSchema = z.object({
  summary: z.string(),
  insertions: z.array(MixingItemSchema),
});

export const ComplexityOpportunitySchema = z.object({
  original_sentence: z.string().describe("The learner's sentence(s), copied verbatim."),
  suggestion: z.string().describe("An alternative construction that preserves the meaning."),
  structures: z.array(z.string()).describe("Grammatical structures the suggestion uses."),
  explanation: z.string().describe("How the construction works, in English."),
  try_it: z.string().describe("An invitation to rewrite independently, naming a structure to try."),
});

export const ComplexityResultSchema = z.object({
  summary: z.string(),
  strengths: z
    .array(
      z.object({
        structure: z.string().describe("e.g. relative clause with dont, concessive bien que + subjonctif"),
        excerpt: z.string().describe("Where the learner used it, copied verbatim."),
      }),
    )
    .describe("Complex structures the learner already used well."),
  sentence_variety: z.string().describe("One or two sentences on variety of sentence length and openings."),
  opportunities: z.array(ComplexityOpportunitySchema),
});

export type GrammarResult = z.infer<typeof GrammarResultSchema>;
export type GrammarIssue = z.infer<typeof GrammarIssueSchema>;
export type VocabularyResult = z.infer<typeof VocabularyResultSchema>;
export type VocabularyItem = z.infer<typeof VocabularyItemSchema>;
export type MixingResult = z.infer<typeof MixingResultSchema>;
export type MixingItem = z.infer<typeof MixingItemSchema>;
export type ComplexityResult = z.infer<typeof ComplexityResultSchema>;
export type ComplexityOpportunity = z.infer<typeof ComplexityOpportunitySchema>;

export type LensResult = {
  grammar: GrammarResult;
  vocabulary: VocabularyResult;
  mixing: MixingResult;
  complexity: ComplexityResult;
};

export const LENS_SCHEMAS = {
  grammar: GrammarResultSchema,
  vocabulary: VocabularyResultSchema,
  mixing: MixingResultSchema,
  complexity: ComplexityResultSchema,
} as const;

export type AnalysisResponse<L extends Lens = Lens> = {
  lens: L;
  result: LensResult[L];
  /** true when produced by the built-in demo analyzer instead of Claude */
  demo: boolean;
  model: string | null;
};

export const AnalyzeRequestSchema = z.object({
  text: z.string().min(1).max(20000),
  lens: z.enum(LENSES),
  targetLanguage: z.literal("French").default("French"),
  supportLanguage: z.literal("English").default("English"),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
