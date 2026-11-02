/**
 * Synthetic evaluation cases (written for this suite; no learner data).
 *
 * Each case lists the lenses it exercises and machine-checkable expectations.
 * Checks are deliberately conservative: they catch clear failures (false
 * corrections, wrong lens, changed meaning, missed obvious errors), not style.
 */

import type { Lens } from "../src/lib/analysis/schemas";

export type GrammarExpect = {
  /** an issue (kind error or ambiguous) whose `original` contains this text must exist */
  mustFlag?: { excerpt: string; category?: string[]; correctedIncludes?: string }[];
  /** no issue of kind "error" may have an `original` containing this text */
  mustNotFlagAsError?: string[];
  /** no `corrected` may match this pattern (e.g. a changed subject/tense) */
  forbiddenCorrection?: RegExp[];
  /** issues touching this excerpt must not be confident errors (ambiguous, style, or confidence ≠ high) */
  notConfidentErrorOn?: string[];
  /** max number of kind=error issues (for correct texts) */
  maxErrors?: number;
};

export type VocabularyExpect = {
  /** these English words must not appear in any item (Language Mixing owns them) */
  mustNotMention?: string[];
  /** an item whose original contains this text must exist with one of these kinds */
  mustFlag?: { excerpt: string; kinds: string[] }[];
  /** if an item touches this excerpt it must be enrichment/more_precise, never incorrect_choice */
  notIncorrect?: string[];
};

export type MixingExpect = {
  mustFind?: string[];
  mustNotFind?: string[];
};

export type ComplexityExpect = {
  minOpportunities?: number;
  maxOpportunities?: number;
  minStrengths?: number;
};

export type EvalCase = {
  id: string;
  covers: string;
  text: string;
  lenses: Partial<{
    grammar: GrammarExpect;
    vocabulary: VocabularyExpect;
    mixing: MixingExpect;
    complexity: ComplexityExpect;
  }>;
};

export const CASES: EvalCase[] = [
  {
    id: "correct-valid-alternatives",
    covers: "1. Correct French that must not be corrected (deuxième/seconde, mon autre amie, gagner)",
    text:
      "Samedi dernier, nous avons joué aux cartes chez Paul. Yvonne a gagné la première partie, puis nous avons commencé la deuxième manche. " +
      "Mon autre amie, qui habite à Lyon, est arrivée vers vingt heures avec un gâteau au chocolat.",
    lenses: {
      grammar: { maxErrors: 0, mustNotFlagAsError: ["gagné", "deuxième", "Mon autre amie", "arrivée"] },
      vocabulary: { notIncorrect: ["gagné", "deuxième"] },
      mixing: { mustNotFind: ["Lyon", "Paul"] },
    },
  },
  {
    id: "boggle-context",
    covers: "3/2. Context decides subject and tense ('ont joue' = 'on joue', present), spelling vs grammar",
    text:
      "Ce soir, je reste à la maison. Maintenant je suis avec mes amis et ont joue du boggle dans la tele. C'est très amusant et tout le monde rit.",
    lenses: {
      grammar: {
        mustFlag: [
          { excerpt: "ont joue", correctedIncludes: "on joue" },
          { excerpt: "du", category: ["article_preposition"] },
          { excerpt: "tele", category: ["spelling_accent"] },
        ],
        forbiddenCorrection: [/ont jou[ée]/i, /avons jou[ée]/i, /ils jouent/i],
      },
      mixing: { mustNotFind: ["boggle"] },
    },
  },
  {
    id: "genuine-errors",
    covers: "2. Genuine agreement and elision errors",
    text:
      "Hier, je suis allé au cinéma avec ma sœur. Le film était très intéressante. Après, nous sommes rentré à la maison parce que il pleuvait beaucoup.",
    lenses: {
      grammar: {
        mustFlag: [
          { excerpt: "intéressante", category: ["agreement"] },
          { excerpt: "rentré", category: ["agreement", "conjugation"] },
          { excerpt: "que il", correctedIncludes: "qu'il" },
        ],
        mustNotFlagAsError: ["je suis allé", "ma sœur"],
      },
    },
  },
  {
    id: "missing-accents",
    covers: "2. Missing accents are spelling, not agreement/conjugation",
    text: "Je suis tres content parce que mon frere a reussi son examen. Il a etudie pendant des semaines et il merite des vacances.",
    lenses: {
      grammar: {
        mustFlag: [
          { excerpt: "tres", category: ["spelling_accent"] },
          { excerpt: "frere", category: ["spelling_accent"] },
          { excerpt: "reussi", category: ["spelling_accent"] },
          { excerpt: "etudie", category: ["spelling_accent"] },
        ],
      },
    },
  },
  {
    id: "ambiguous-tense",
    covers: "3. Ambiguous: narrative present after 'Hier' may be intended",
    text: "Hier, je vais au marché et j'achète des pommes. Le vendeur est très gentil et il me donne une orange en plus.",
    lenses: {
      grammar: { notConfidentErrorOn: ["vais", "achète", "donne"] },
    },
  },
  {
    id: "english-insertions",
    covers: "4. English words inside French; loanwords left alone; Vocabulary must not duplicate Mixing",
    text:
      "Le week-end dernier, je suis allé à la plage avec mes coworkers. Il faisait beau, mais j'étais un peu tired parce que j'avais travaillé late la veille. On a mangé une pizza au parking.",
    lenses: {
      mixing: { mustFind: ["coworkers", "tired", "late"], mustNotFind: ["week-end", "parking", "pizza"] },
      vocabulary: { mustNotMention: ["coworkers", "tired", "late"] },
    },
  },
  {
    id: "wrong-word-choice",
    covers: "5. Incorrect French word choice (librairie vs bibliothèque in a borrowing context)",
    text:
      "Je vais souvent à la librairie municipale pour emprunter des livres gratuitement. La semaine dernière, j'ai emprunté trois romans policiers et je dois les rendre lundi.",
    lenses: {
      vocabulary: { mustFlag: [{ excerpt: "librairie", kinds: ["incorrect_choice"] }] },
      grammar: { maxErrors: 0 },
    },
  },
  {
    id: "correct-but-unnatural",
    covers: "6. Correct but repetitive/vague (faire everywhere)",
    text: "Le dimanche, je fais du sport le matin. Ensuite je fais la cuisine, je fais mes devoirs et je fais une promenade avec mon chien.",
    lenses: {
      grammar: { maxErrors: 0 },
      vocabulary: { mustFlag: [{ excerpt: "fais", kinds: ["repetition", "more_precise", "enrichment"] }] },
    },
  },
  {
    id: "subtle-complex-errors",
    covers: "7. Complex sentences with subtle errors (si + conditionnel, bien que + indicatif, PDO agreement)",
    text:
      "Si j'aurais su que tu venais, j'aurais préparé un gâteau. Bien que je suis fatiguée, je vais sortir ce soir. Les lettres que j'ai écrit hier sont sur la table.",
    lenses: {
      grammar: {
        mustFlag: [
          { excerpt: "aurais su", category: ["conjugation"], correctedIncludes: "avais su" },
          { excerpt: "je suis", category: ["conjugation"], correctedIncludes: "sois" },
          { excerpt: "écrit", category: ["agreement"], correctedIncludes: "écrites" },
        ],
      },
    },
  },
  {
    id: "simple-sentences",
    covers: "8. Simple sentences that could be combined without changing meaning",
    text: "J'ai un chien. Il s'appelle Max. Il est très gentil. Je le promène tous les soirs. Il aime courir dans le parc.",
    lenses: {
      complexity: { minOpportunities: 1, maxOpportunities: 4 },
      grammar: { maxErrors: 0 },
    },
  },
  {
    id: "already-sophisticated",
    covers: "8 (control). Already well-constructed: no forced complexity",
    text:
      "Bien qu'il ait plu toute la journée, nous sommes sortis, car nous voulions voir le marché de Noël dont tout le monde parlait. Quand nous sommes arrivés, la place était déjà illuminée.",
    lenses: {
      complexity: { maxOpportunities: 1, minStrengths: 1 },
      grammar: { maxErrors: 0 },
    },
  },
  {
    id: "et-chain",
    covers: "8. Run of 'et' where a logical connector would express the intended relation",
    text: "Il pleuvait et je n'avais pas de parapluie et je suis rentré trempé et j'ai pris une douche chaude.",
    lenses: {
      complexity: { minOpportunities: 1 },
    },
  },
];

export const LENS_ORDER: Lens[] = ["grammar", "vocabulary", "mixing", "complexity"];
