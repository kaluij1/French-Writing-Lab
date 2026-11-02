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
    blurb: "Genuine errors in conjugation, agreement, articles, prepositions, spelling and word order.",
  },
  vocabulary: {
    title: "Vocabulary",
    blurb: "French words that don't fit, repetition, and ways to enrich words that are already correct.",
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

/**
 * Grammar categories. Stored analyses created before this list existed may contain
 * older values (verb_conjugation, tense, article, elision…); the UI still labels them.
 */
export const GRAMMAR_CATEGORIES = [
  "grammar",
  "agreement",
  "conjugation",
  "word_order",
  "article_preposition",
  "spelling_accent",
  "punctuation",
  "style",
] as const;

/** error = genuine mistake · ambiguous = intended meaning unclear · style = optional improvement of correct French */
export const GRAMMAR_KINDS = ["error", "ambiguous", "style"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export const GrammarIssueSchema = z.object({
  original: z.string().describe("Exact excerpt copied verbatim from the learner's draft (smallest span containing the issue)."),
  corrected: z.string().describe("The same excerpt, minimally corrected, keeping the learner's subject, tense and meaning."),
  sentence: z.string().describe("The learner's full sentence containing the excerpt, copied verbatim."),
  kind: z.enum(GRAMMAR_KINDS),
  category: z.enum(GRAMMAR_CATEGORIES),
  explanation: z.string().describe("Clear English explanation for a B1–B2 learner."),
  rule: z.string().describe("Name of the French rule involved."),
  example: z.string().describe("A short, different French sentence showing correct usage."),
  valid_alternatives: z
    .array(z.string())
    .describe("Other correct ways to write the corrected excerpt, if any. Empty list if none."),
  interpretations: z
    .array(z.string())
    .describe("For kind=ambiguous: the plausible intended meanings, each with its correct French. Otherwise empty."),
  confidence: z.enum(CONFIDENCE_LEVELS).describe("Your own estimate of how sure you are; not a measured probability."),
});

export const GrammarResultSchema = z.object({
  summary: z.string().describe("Two or three sentences in English giving an overall picture."),
  issues: z.array(GrammarIssueSchema),
});

/** english_word is no longer produced (Language Mixing owns English insertions) but may exist in stored analyses. */
export const VOCAB_KINDS = ["incorrect_choice", "more_precise", "repetition", "enrichment"] as const;

export const VocabularyItemSchema = z.object({
  kind: z.enum(VOCAB_KINDS),
  original: z.string().describe("Exact French excerpt copied verbatim from the learner's draft."),
  sentence: z.string().describe("The learner's full sentence containing the excerpt, copied verbatim."),
  suggestion: z.string().describe("Recommended French word or expression, in the form the sentence needs."),
  english: z.string().describe("Short English gloss of the suggestion."),
  translation_type: z
    .enum(["direct", "contextual"])
    .describe("direct = plain equivalent; contextual = chosen for this context, collocation or register."),
  explanation: z.string().describe("Why this word fits this context, in English. For enrichment, say the original is correct."),
  example: z.string().describe("Example French sentence using the suggestion."),
  alternatives: z.array(z.string()).describe("Similar French expressions with brief nuances, possibly empty."),
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

/** Character offsets of an item's excerpt in the analysed text; null when it could not be located safely. */
export type Span = { start: number; end: number };
/** Added by the server after validation, never produced by the model. Absent on older stored analyses. */
export type Located = { locations?: (Span | null)[] };

export type LensResult = {
  grammar: GrammarResult & Located;
  vocabulary: VocabularyResult & Located;
  mixing: MixingResult & Located;
  complexity: ComplexityResult & Located;
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
