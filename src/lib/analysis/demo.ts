import type {
  ComplexityOpportunity,
  ComplexityResult,
  GrammarIssue,
  GrammarResult,
  Lens,
  LensResult,
  MixingItem,
  MixingResult,
  VocabularyItem,
  VocabularyResult,
} from "./schemas";
import { splitSentences } from "@/lib/text";

/**
 * Demo analyzer used when no Claude API key is configured.
 *
 * It is deliberately simple and rule-based, but every finding is anchored to the
 * learner's real text so the whole flow (highlighting, saving vocabulary, lens
 * switching) can be exercised end to end without credentials.
 */

// ---------- text helpers ----------

const APOS = /[’']/g;


function sentenceContaining(text: string, excerpt: string): string {
  return splitSentences(text).find((s) => s.includes(excerpt)) ?? excerpt;
}

function words(s: string): string[] {
  return s.match(/[A-Za-zÀ-ÖØ-öø-ÿœŒ'’-]+/g) ?? [];
}

// ---------- English detection ----------

const EN_DICT: Record<string, { fr: string; alts?: string[]; note?: string }> = {
  the: { fr: "le / la / les" },
  and: { fr: "et" },
  but: { fr: "mais" },
  because: { fr: "parce que", alts: ["car", "puisque"] },
  with: { fr: "avec" },
  without: { fr: "sans" },
  about: { fr: "à propos de", alts: ["au sujet de", "environ"] },
  however: { fr: "cependant", alts: ["pourtant", "toutefois"] },
  although: { fr: "bien que (+ subjonctif)", alts: ["même si (+ indicatif)"] },
  therefore: { fr: "donc", alts: ["par conséquent", "c'est pourquoi"] },
  meanwhile: { fr: "pendant ce temps", alts: ["en attendant"] },
  enough: { fr: "assez", alts: ["suffisamment"] },
  maybe: { fr: "peut-être" },
  really: { fr: "vraiment" },
  always: { fr: "toujours" },
  never: { fr: "jamais" },
  sometimes: { fr: "parfois", alts: ["de temps en temps"] },
  already: { fr: "déjà" },
  still: { fr: "encore", alts: ["toujours"] },
  almost: { fr: "presque" },
  together: { fr: "ensemble" },
  outside: { fr: "dehors", alts: ["à l'extérieur"] },
  inside: { fr: "dedans", alts: ["à l'intérieur"] },
  tired: { fr: "fatigué(e)", alts: ["épuisé(e)", "crevé(e) (familier)"] },
  happy: { fr: "heureux / heureuse", alts: ["content(e)", "ravi(e)"] },
  sad: { fr: "triste" },
  angry: { fr: "en colère", alts: ["fâché(e)", "furieux / furieuse"] },
  scared: { fr: "effrayé(e)", alts: ["avoir peur"] },
  proud: { fr: "fier / fière" },
  lonely: { fr: "seul(e)", alts: ["isolé(e)"], note: "French has no single word for 'lonely'; 'se sentir seul' is the natural phrasing." },
  busy: { fr: "occupé(e)", alts: ["débordé(e)"] },
  lazy: { fr: "paresseux / paresseuse" },
  weird: { fr: "bizarre", alts: ["étrange"] },
  boring: { fr: "ennuyeux / ennuyeuse", alts: ["barbant (familier)"] },
  expensive: { fr: "cher / chère", alts: ["coûteux"] },
  cheap: { fr: "bon marché", alts: ["pas cher"] },
  easy: { fr: "facile" },
  hard: { fr: "difficile", alts: ["dur"] },
  useful: { fr: "utile" },
  crowded: { fr: "bondé(e)", alts: ["plein(e) de monde"] },
  quiet: { fr: "calme", alts: ["tranquille", "silencieux"] },
  loud: { fr: "bruyant(e)", alts: ["fort"] },
  beach: { fr: "la plage" },
  mountain: { fr: "la montagne" },
  mountains: { fr: "les montagnes" },
  river: { fr: "la rivière", alts: ["le fleuve (flows into the sea)"] },
  tree: { fr: "l'arbre (m.)" },
  trees: { fr: "les arbres" },
  weather: { fr: "le temps", alts: ["la météo (forecast)"], note: "Use 'il fait beau / mauvais' to describe the weather." },
  rain: { fr: "la pluie", alts: ["pleuvoir (verb)"] },
  snow: { fr: "la neige" },
  job: { fr: "le travail", alts: ["l'emploi (m.)", "le poste", "le boulot (familier)"] },
  work: { fr: "le travail", alts: ["travailler (verb)"] },
  meeting: { fr: "la réunion", note: "'Un meeting' in French usually means a political rally." },
  boss: { fr: "le / la patron(ne)", alts: ["le / la responsable", "le / la supérieur(e)"] },
  colleague: { fr: "le / la collègue" },
  coworkers: { fr: "les collègues" },
  deadline: { fr: "la date limite", alts: ["l'échéance (f.)", "le délai"] },
  skills: { fr: "les compétences (f.)" },
  goal: { fr: "le but", alts: ["l'objectif (m.)"] },
  goals: { fr: "les objectifs (m.)", alts: ["les buts"] },
  challenge: { fr: "le défi" },
  feeling: { fr: "le sentiment", alts: ["l'impression (f.)"] },
  feelings: { fr: "les sentiments" },
  thought: { fr: "la pensée", alts: ["pensé (participle)"] },
  idea: { fr: "l'idée (f.)" },
  knowledge: { fr: "les connaissances (f.)", alts: ["le savoir"] },
  childhood: { fr: "l'enfance (f.)" },
  neighborhood: { fr: "le quartier" },
  neighbourhood: { fr: "le quartier" },
  neighbor: { fr: "le / la voisin(e)" },
  grandmother: { fr: "la grand-mère" },
  grandfather: { fr: "le grand-père" },
  friend: { fr: "l'ami(e)", alts: ["le / la copain / copine"] },
  friends: { fr: "les amis", alts: ["les copains"] },
  family: { fr: "la famille" },
  house: { fr: "la maison" },
  kitchen: { fr: "la cuisine" },
  city: { fr: "la ville" },
  village: { fr: "le village" },
  trip: { fr: "le voyage", alts: ["l'excursion (f.)", "le séjour"] },
  journey: { fr: "le trajet", alts: ["le voyage", "le parcours"] },
  holiday: { fr: "les vacances (f. pl.)", alts: ["le jour férié (public holiday)"] },
  vacation: { fr: "les vacances (f. pl.)" },
  luggage: { fr: "les bagages (m.)" },
  train: { fr: "le train" },
  station: { fr: "la gare", alts: ["la station (métro)"] },
  airport: { fr: "l'aéroport (m.)" },
  flight: { fr: "le vol" },
  ticket: { fr: "le billet", alts: ["le ticket (métro, bus)"] },
  book: { fr: "le livre", alts: ["réserver (to book)"] },
  bookstore: { fr: "la librairie", note: "Careful: 'la bibliothèque' is a library." },
  library: { fr: "la bibliothèque", note: "Careful: 'la librairie' is a bookshop." },
  cooking: { fr: "la cuisine", alts: ["cuisiner (verb)"] },
  dinner: { fr: "le dîner" },
  lunch: { fr: "le déjeuner" },
  breakfast: { fr: "le petit-déjeuner" },
  smell: { fr: "l'odeur (f.)", alts: ["sentir (verb)"] },
  noise: { fr: "le bruit" },
  memory: { fr: "le souvenir", alts: ["la mémoire (the faculty)"], note: "'Un souvenir' is a specific memory; 'la mémoire' is the ability to remember." },
  memories: { fr: "les souvenirs", note: "'Les souvenirs' are specific memories; 'la mémoire' is the faculty." },
  remember: { fr: "se souvenir de", alts: ["se rappeler"] },
  forget: { fr: "oublier" },
  realize: { fr: "se rendre compte (de / que)", alts: ["prendre conscience de"], note: "'Réaliser' traditionally means to carry out; 'se rendre compte' is the safer choice." },
  realized: { fr: "je me suis rendu compte", alts: ["j'ai pris conscience"] },
  enjoy: { fr: "apprécier", alts: ["profiter de", "aimer"] },
  enjoyed: { fr: "apprécié", alts: ["profité de"] },
  try: { fr: "essayer (de)", alts: ["tenter de"] },
  tried: { fr: "essayé", alts: ["tenté"] },
  decide: { fr: "décider (de)" },
  decided: { fr: "décidé" },
  improve: { fr: "améliorer", alts: ["progresser en (to improve at)"] },
  learn: { fr: "apprendre" },
  learned: { fr: "appris" },
  grow: { fr: "grandir", alts: ["pousser (plants)", "croître"] },
  grew: { fr: "j'ai grandi", alts: ["a poussé"] },
  move: { fr: "déménager (house)", alts: ["bouger", "se déplacer"] },
  moved: { fr: "déménagé", alts: ["bougé"] },
  miss: { fr: "manquer (à)", note: "Inverted structure: 'I miss you' = 'tu me manques'." },
  missed: { fr: "manqué", note: "'J'ai raté le train' for a missed train; 'tu m'as manqué' for missing a person." },
  wait: { fr: "attendre" },
  waited: { fr: "attendu" },
  worry: { fr: "s'inquiéter", alts: ["se faire du souci"] },
  worried: { fr: "inquiet / inquiète", alts: ["soucieux"] },
  achieve: { fr: "atteindre", alts: ["réussir à", "accomplir"] },
  struggle: { fr: "avoir du mal à", alts: ["peiner à", "lutter"] },
  stuff: { fr: "des choses", alts: ["des affaires (belongings)", "des trucs (familier)"] },
  things: { fr: "les choses" },
  people: { fr: "les gens", alts: ["les personnes"] },
  everyone: { fr: "tout le monde" },
  someone: { fr: "quelqu'un" },
  nothing: { fr: "rien" },
  something: { fr: "quelque chose" },
  everything: { fr: "tout" },
  everywhere: { fr: "partout" },
  nowhere: { fr: "nulle part" },
  yesterday: { fr: "hier" },
  tomorrow: { fr: "demain" },
  today: { fr: "aujourd'hui" },
  tonight: { fr: "ce soir" },
  morning: { fr: "le matin", alts: ["la matinée (the whole morning)"] },
  evening: { fr: "le soir", alts: ["la soirée (the whole evening)"] },
  week: { fr: "la semaine" },
  year: { fr: "l'an / l'année", note: "'An' for counting (trois ans), 'année' for duration or description (une belle année)." },
  years: { fr: "ans / années" },
  life: { fr: "la vie" },
  world: { fr: "le monde" },
  country: { fr: "le pays", alts: ["la campagne (countryside)"] },
  countryside: { fr: "la campagne" },
  view: { fr: "la vue", alts: ["le point de vue (opinion)"] },
  sunset: { fr: "le coucher de soleil" },
  sunrise: { fr: "le lever de soleil" },
  homesick: { fr: "avoir le mal du pays" },
  hometown: { fr: "la ville natale" },
  willing: { fr: "prêt(e) à", alts: ["disposé(e) à"] },
  unfortunately: { fr: "malheureusement" },
  fortunately: { fr: "heureusement" },
  actually: { fr: "en fait", note: "Not 'actuellement', which means 'currently'." },
  especially: { fr: "surtout", alts: ["particulièrement", "notamment"] },
  finally: { fr: "enfin", alts: ["finalement"] },
  suddenly: { fr: "soudain", alts: ["tout à coup", "brusquement"] },
  quickly: { fr: "rapidement", alts: ["vite"] },
  slowly: { fr: "lentement" },
  probably: { fr: "probablement", alts: ["sans doute"] },
  overwhelmed: { fr: "débordé(e)", alts: ["submergé(e)", "dépassé(e)"] },
  excited: { fr: "enthousiaste", alts: ["impatient(e) de", "avoir hâte de"], note: "Avoid 'excité(e)', which often has a sexual connotation." },
  embarrassed: { fr: "gêné(e)", alts: ["mal à l'aise"], note: "Not 'embarrassé', which usually means 'perplexed'." },
  grateful: { fr: "reconnaissant(e)" },
  relieved: { fr: "soulagé(e)" },
  surprised: { fr: "surpris(e)", alts: ["étonné(e)"] },
  disappointed: { fr: "déçu(e)" },
  nervous: { fr: "nerveux / nerveuse", alts: ["stressé(e)", "angoissé(e)"] },
  should: { fr: "devrais / devrait (conditionnel de devoir)" },
  would: { fr: "(conditionnel)", note: "English 'would' is expressed by the conditional ending: je ferais, il viendrait." },
  could: { fr: "pourrais / pourrait (conditionnel de pouvoir)" },
  while: { fr: "pendant que", alts: ["alors que (contrast)", "tandis que"] },
  since: { fr: "depuis (que)", alts: ["puisque (cause)"] },
  until: { fr: "jusqu'à (ce que + subjonctif)" },
  unless: { fr: "à moins que (+ subjonctif)", alts: ["sauf si"] },
  whether: { fr: "si" },
  which: { fr: "qui / que / lequel" },
  where: { fr: "où" },
  when: { fr: "quand", alts: ["lorsque"] },
  what: { fr: "ce que / ce qui / quoi" },
  who: { fr: "qui" },
  why: { fr: "pourquoi" },
  how: { fr: "comment" },
  this: { fr: "ce / cette / ceci" },
  that: { fr: "ce / cette / que" },
  these: { fr: "ces" },
  those: { fr: "ces / ceux-là" },
  very: { fr: "très", alts: ["vraiment", "extrêmement"] },
  also: { fr: "aussi", alts: ["également"] },
  only: { fr: "seulement", alts: ["ne… que"] },
  just: { fr: "juste", alts: ["venir de (+ inf.) for 'just did'"] },
  too: { fr: "trop", alts: ["aussi (also)"] },
  my: { fr: "mon / ma / mes" },
  your: { fr: "ton / ta / tes / votre / vos" },
  our: { fr: "notre / nos" },
  their: { fr: "leur / leurs" },
  his: { fr: "son / sa / ses" },
  her: { fr: "son / sa / ses / la / lui" },
  they: { fr: "ils / elles" },
  we: { fr: "nous / on" },
  is: { fr: "est" },
  are: { fr: "sont / êtes / sommes" },
  was: { fr: "était / a été" },
  were: { fr: "étaient / étions" },
  have: { fr: "avoir" },
  had: { fr: "avait / a eu" },
  feel: { fr: "se sentir", alts: ["ressentir"] },
  felt: { fr: "je me suis senti(e)", alts: ["j'ai ressenti"] },
  think: { fr: "penser", alts: ["croire", "trouver (opinion)"] },
  know: { fr: "savoir / connaître", note: "'Savoir' for facts and skills, 'connaître' for people and places." },
  want: { fr: "vouloir", alts: ["avoir envie de"] },
  need: { fr: "avoir besoin de" },
  like: { fr: "aimer", alts: ["comme (comparison)"] },
  love: { fr: "adorer", alts: ["aimer"] },
  hate: { fr: "détester" },
  it: { fr: "il / elle / ce / le / la" },
  you: { fr: "tu / vous" },
  she: { fr: "elle" },
  he: { fr: "il" },
  of: { fr: "de" },
  to: { fr: "à / pour" },
  for: { fr: "pour" },
  in: { fr: "dans / en" },
  from: { fr: "de / depuis" },
  not: { fr: "ne… pas" },
  so: { fr: "donc", alts: ["alors", "si (so + adjective)"] },
  get: { fr: "obtenir / devenir / recevoir", note: "'Get' has no single French equivalent; choose by meaning." },
  got: { fr: "obtenu / reçu / devenu", note: "'Got' depends on meaning: received (reçu), became (devenu), obtained (obtenu)." },
};

/** Words that look English but are standard in French, or are French words. */
const FRENCH_SAFE = new Set([
  "a", "an", "on", "en", "me", "te", "se", "son", "sa", "ces", "est", "sale", "pour", "plus", "dent", "but",
  "important", "parking", "week-end", "weekend", "camping", "shopping", "marketing", "jogging", "football",
  "email", "e-mail", "sandwich", "toast", "stress", "cool", "job", "fun", "star", "sport", "tennis", "budget",
  "film", "internet", "web", "blog", "smartphone", "bus", "taxi", "hotel", "simple", "possible", "grand",
  "village", "train", "station", "ticket", "sport", "rose", "four", "pain", "chat", "main", "coin", "car",
  "dire", "comment", "fort", "tard", "long", "note", "place", "type", "table", "image", "page", "date",
  "nature", "culture", "question", "situation", "solution", "action", "attention", "information",
]);

// "job", "but", "village", "train", "station", "ticket" are valid French; "but" is French for "goal".
for (const w of ["job", "village", "train", "station", "ticket", "but"]) delete EN_DICT[w];

const EN_HINT = /^(?:[a-z]+(?:ing|ly|ness|ful|ship))$/;
const FR_ING_LOANS = new Set(["parking", "camping", "shopping", "marketing", "jogging", "meeting", "smoking", "brushing", "footing", "planning", "building", "piercing", "living", "dancing", "pressing", "lifting", "coaching", "casting", "standing"]);

function isEnglishWord(raw: string): boolean {
  const w = raw.toLowerCase().replace(APOS, "'");
  if (w.length < 2 || FRENCH_SAFE.has(w)) return false;
  if (/[àâçéèêëîïôûùüÿœ]/.test(w)) return false;
  if (EN_DICT[w]) return true;
  if (FR_ING_LOANS.has(w)) return false;
  return EN_HINT.test(w) && w.length > 4;
}

/** Find runs of consecutive English words, returned verbatim from the text. */
export function findEnglishRuns(text: string): string[] {
  const runs: string[] = [];
  const re = /[A-Za-zÀ-ÖØ-öø-ÿœŒ'’-]+/g;
  let m: RegExpExecArray | null;
  let current: { start: number; end: number } | null = null;
  const flush = () => {
    if (current) runs.push(text.slice(current.start, current.end));
    current = null;
  };
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (isEnglishWord(m[0])) {
      const gap = current ? text.slice(current.end, start) : "";
      if (current && /^\s+$/.test(gap)) current.end = end;
      else {
        flush();
        current = { start, end };
      }
    } else flush();
  }
  flush();
  // de-duplicate, keep first occurrence order
  return [...new Set(runs)];
}

function translateRun(run: string): { fr: string; alts: string[]; note?: string } {
  const ws = words(run).map((w) => w.toLowerCase());
  if (ws.length === 1 && EN_DICT[ws[0]]) {
    const e = EN_DICT[ws[0]];
    return { fr: e.fr, alts: e.alts ?? [], note: e.note };
  }
  const parts = ws.map((w) => EN_DICT[w]?.fr ?? w);
  return {
    fr: parts.join(" "),
    alts: [],
    note: "Word-by-word demo translation of a multi-word phrase. With Claude connected you get a natural, context-aware rendering.",
  };
}

// ---------- Lens: language mixing ----------

function demoMixing(text: string): MixingResult {
  const insertions: MixingItem[] = findEnglishRuns(text).map((run) => {
    const t = translateRun(run);
    const sentence = sentenceContaining(text, run);
    const firstFr = t.fr.split(" / ")[0].replace(/\s*\(.*?\)\s*/g, " ").trim();
    // In the rewritten sentence, drop the dictionary article when the learner already wrote a determiner.
    const before = sentence.slice(0, sentence.indexOf(run)).trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    const hasDeterminer = /^(le|la|les|l'|un|une|des|du|ma|mon|mes|ta|ton|tes|sa|son|ses|notre|nos|votre|vos|leur|leurs|ce|cet|cette|ces)$/.test(before);
    const inSentence = hasDeterminer ? firstFr.replace(/^(le|la|les)\s+|^l'/i, "") : firstFr;
    return {
      original: run,
      french: t.fr,
      sentence,
      rewritten_sentence: sentence.replace(run, inSentence),
      explanation:
        (t.note ? t.note + " " : "") +
        `"${run}" is English. In this sentence the natural French is "${t.fr}". Check the gender and agreement the French word requires in your sentence.`,
      example: exampleFor(firstFr),
      alternatives: t.alts,
    };
  });
  return {
    summary: insertions.length
      ? `You used ${insertions.length} English expression${insertions.length > 1 ? "s" : ""} where the French did not come to mind. That is exactly how this space is meant to be used: each one is a word worth adding to your active vocabulary.`
      : "No English insertions were found. Every idea in this draft was expressed in French.",
    insertions,
  };
}

function exampleFor(fr: string): string {
  return `Exemple : « J'essaie d'utiliser « ${fr} » dans une phrase de mon prochain texte. »`;
}

// ---------- Lens: grammar ----------

type Rule = {
  re: RegExp;
  fix: (m: RegExpExecArray) => string;
  category: GrammarIssue["category"];
  elision?: boolean;
  rule: string;
  explanation: string;
  example: string;
};

const VOWEL = "[aeiouéèêàâîôûAEIOUÉÈÊÀÂÎÔÛ]";
// JS \b is ASCII-only, so use Unicode-aware boundaries for French text.
const B = "(?<![\\p{L}'’])";
const E = "(?![\\p{L}])";
const NO_ELIDE_AFTER = /^(ou|où|et|un|une|onze|oui|ah|oh|a)$/i;
const ETRE_VERBS =
  "allé|venu|parti|arrivé|sorti|entré|resté|né|mort|tombé|devenu|revenu|rentré|retourné|monté|descendu|passé par";

const GRAMMAR_RULES: Rule[] = [
  {
    re: new RegExp(`${B}(que|de|je|me|te|se|ne|ce|le|la)\\s+(${VOWEL}\\p{L}*)`, "giu"),
    fix: (m) => `${m[1].slice(0, -1)}'${m[2]}`,
    category: "grammar",
    elision: true,
    rule: "Elision",
    explanation:
      "Short words ending in -e or -a (que, de, je, me, ne, le, la, ce…) drop their final vowel and take an apostrophe before a word starting with a vowel sound.",
    example: "Je pense qu'elle arrive. J'ai acheté l'affiche.",
  },
  {
    re: new RegExp(`${B}si\\s+(ils?)${E}`, "giu"),
    fix: (m) => `s'${m[1]}`,
    category: "grammar",
    elision: true,
    rule: "Elision of si before il / ils",
    explanation: "Si elides only before il and ils: s'il, s'ils (but si elle, si on).",
    example: "S'il pleut demain, nous resterons à la maison.",
  },
  {
    re: new RegExp(`${B}à\\s+(le|les)\\s+`, "giu"),
    fix: (m) => (m[1].toLowerCase() === "le" ? "au " : "aux "),
    category: "article_preposition",
    rule: "Contraction à + le / les",
    explanation: "À combines with le to give au, and with les to give aux. (À la and à l' stay unchanged.)",
    example: "Je vais au marché, puis aux Galeries Lafayette.",
  },
  {
    re: new RegExp(`${B}de\\s+(le|les)\\s+`, "giu"),
    fix: (m) => (m[1].toLowerCase() === "le" ? "du " : "des "),
    category: "article_preposition",
    rule: "Contraction de + le / les",
    explanation: "De combines with le to give du, and with les to give des.",
    example: "Je reviens du bureau et je parle des vacances.",
  },
  {
    re: new RegExp(
      `${B}(j'ai|j’ai|tu as|il a|elle a|on a|nous avons|vous avez|ils ont|elles ont)\\s+(${ETRE_VERBS})(e?s?)${E}`,
      "giu",
    ),
    fix: (m) => {
      const map: Record<string, string> = {
        "j'ai": "je suis", "j’ai": "je suis", "tu as": "tu es", "il a": "il est", "elle a": "elle est",
        "on a": "on est", "nous avons": "nous sommes", "vous avez": "vous êtes", "ils ont": "ils sont", "elles ont": "elles sont",
      };
      return `${map[m[1].toLowerCase()] ?? m[1]} ${m[2]}${m[3]}`;
    },
    category: "conjugation",
    rule: "Passé composé with être",
    explanation:
      "Verbs of movement and change of state (aller, venir, partir, arriver, rester, tomber, naître, mourir…) form the passé composé with être, and the past participle agrees with the subject.",
    example: "Elle est partie tôt et nous sommes arrivés après elle.",
  },
  {
    re: new RegExp(`${B}si\\s+(j'|j’|tu |il |elle |on |nous |vous |ils |elles )(\\p{L}+(?:rais|rait|rions|riez|raient))${E}`, "giu"),
    fix: (m) => `si ${m[1]}[imparfait]`,
    category: "conjugation",
    rule: "Si + imparfait, conditionnel",
    explanation:
      "After hypothetical si, French uses the imparfait, never the conditional. The conditional goes in the other clause: si j'avais le temps, je voyagerais.",
    example: "Si j'avais plus de temps, j'apprendrais le piano.",
  },
  {
    re: new RegExp(`${B}beaucoup des\\s+`, "giu"),
    fix: () => "beaucoup de ",
    category: "article_preposition",
    rule: "Expressions of quantity + de",
    explanation:
      "After expressions of quantity (beaucoup, peu, trop, assez…), use de alone, without the article, when speaking in general.",
    example: "Il y a beaucoup de monde et peu de places.",
  },
  {
    re: new RegExp(`${B}plus bon(ne)?s?${E}`, "giu"),
    fix: (m) => (m[1] ? "meilleure" : "meilleur"),
    category: "grammar",
    rule: "Irregular comparative: meilleur",
    explanation: "The comparative of bon is meilleur (not plus bon), and it agrees with the noun.",
    example: "Ce gâteau est meilleur que celui d'hier.",
  },
];

function demoGrammar(text: string): GrammarResult {
  const issues: (GrammarIssue & { at: number })[] = [];
  const englishRuns = new Set(findEnglishRuns(text).flatMap((r) => words(r).map((w) => w.toLowerCase())));
  for (const r of GRAMMAR_RULES) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text))) {
      const original = m[0].trimEnd();
      // skip elision false-positives on English words and on h-less tokens like "le un" in lists
      if (r.elision && m[2] && englishRuns.has(m[2].toLowerCase())) continue;
      if (r.elision && m[2] && NO_ELIDE_AFTER.test(m[2])) continue;
      let corrected = r.fix(m).trimEnd();
      if (/^[A-ZÀ-Ö]/.test(original)) corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
      if (corrected.includes("[imparfait]")) {
        const verb = m[2];
        corrected = corrected.replace("[imparfait]", imparfaitGuess(verb));
      }
      issues.push({
        original,
        corrected,
        sentence: sentenceContaining(text, original),
        kind: "error",
        category: r.category,
        explanation: r.explanation,
        rule: r.rule,
        example: r.example,
        valid_alternatives: [],
        interpretations: [],
        confidence: "high",
        at: m.index,
      });
    }
  }
  issues.sort((a, b) => a.at - b.at);
  return {
    summary: issues.length
      ? `The demo checker found ${issues.length} point${issues.length > 1 ? "s" : ""} of grammar to review. The rule-based demo only catches a few common patterns (elision, contractions, être in the passé composé, si-clauses); connect Claude for a full grammatical reading.`
      : "The demo checker found no errors among the common patterns it looks for (elision, contractions, être in the passé composé, si-clauses). Connect Claude for a full grammatical reading.",
    issues: issues.map((issue) => {
      const { at, ...rest } = issue;
      void at;
      return rest;
    }),
  };
}

function imparfaitGuess(conditional: string): string {
  const stems: Record<string, string> = { aur: "av", ser: "ét", pourr: "pouv", voudr: "voul", devr: "dev", fer: "fais", ir: "all", saur: "sav", viendr: "ven" };
  const m = conditional.match(/^(\w+?)(rais|rait|rions|riez|raient)$/);
  if (!m) return conditional;
  const endingMap: Record<string, string> = { rais: "ais", rait: "ait", rions: "ions", riez: "iez", raient: "aient" };
  const fullStem = m[1] + "r";
  const imp = stems[fullStem] ?? m[1].replace(/e$/, "");
  return imp + endingMap[m[2]];
}

// ---------- Lens: vocabulary ----------

const STOP = new Set(
  "le la les un une des du de d l et ou mais donc car ni que qui quoi dont où je tu il elle on nous vous ils elles me te se lui leur y en ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leurs ne pas plus pour par avec sans dans sur sous chez à au aux est sont suis es était avoir être a ai as ont avait été fait comme si tout tous toute toutes aussi bien quand alors c qu j n s m t".split(" "),
);

const SYNONYMS: Record<string, { alts: string[]; english: string; note: string }> = {
  très: { english: "very", alts: ["vraiment", "particulièrement", "extrêmement", "profondément"], note: "Repeating très flattens your descriptions. Choose an adverb that carries a nuance, or a stronger adjective (très fatigué → épuisé)." },
  chose: { english: "thing", alts: ["élément", "aspect", "détail", "sujet"], note: "Chose is vague. Naming the actual thing makes your French more precise." },
  choses: { english: "things", alts: ["éléments", "aspects", "détails", "sujets"], note: "Choses is vague. Naming what you mean makes your French more precise." },
  faire: { english: "to do / make", alts: ["réaliser", "effectuer", "préparer", "accomplir"], note: "Faire works everywhere, which is why a more specific verb sounds more fluent." },
  bon: { english: "good", alts: ["agréable", "excellent", "réussi", "savoureux"], note: "Bon is correct but generic; the right adjective depends on what is good." },
  bien: { english: "well / good", alts: ["agréablement", "correctement", "parfaitement"], note: "Bien is often a placeholder for a more exact word." },
  beaucoup: { english: "a lot", alts: ["énormément", "bien des", "de nombreux", "nombre de"], note: "Vary expressions of quantity: de nombreux amis, énormément de travail." },
  important: { english: "important", alts: ["essentiel", "primordial", "crucial", "capital"], note: "Important is fine, but synonyms add emphasis and variety." },
  dire: { english: "to say", alts: ["affirmer", "expliquer", "raconter", "souligner"], note: "A specific verb of speech tells the reader how something was said." },
  aller: { english: "to go", alts: ["se rendre", "partir", "se diriger"], note: "Se rendre à is a slightly more formal, precise alternative." },
  gens: { english: "people", alts: ["personnes", "habitants", "passants", "individus"], note: "Name the group of people you mean." },
  aimer: { english: "to like / love", alts: ["apprécier", "adorer", "avoir un faible pour", "être passionné de"], note: "These alternatives carry different intensities." },
  intéressant: { english: "interesting", alts: ["passionnant", "captivant", "enrichissant", "stimulant"], note: "Intéressant is overused; say what kind of interesting." },
  beau: { english: "beautiful", alts: ["magnifique", "splendide", "superbe", "pittoresque"], note: "Choose a word that conveys the kind of beauty." },
  belle: { english: "beautiful", alts: ["magnifique", "splendide", "superbe", "ravissante"], note: "Choose a word that conveys the kind of beauty." },
};

function demoVocabulary(text: string): VocabularyResult {
  const items: VocabularyItem[] = [];

  const counts = new Map<string, { n: number; first: string }>();
  for (const w of words(text)) {
    const k = w.toLowerCase().replace(APOS, "'");
    if (STOP.has(k) || k.length < 3) continue;
    const c = counts.get(k) ?? { n: 0, first: w };
    c.n++;
    counts.set(k, c);
  }
  for (const [k, { n, first }] of counts) {
    const syn = SYNONYMS[k];
    if (syn && n >= 2) {
      items.push({
        kind: "repetition",
        original: first,
        sentence: sentenceContaining(text, first),
        suggestion: syn.alts[0],
        english: syn.english,
        translation_type: "contextual",
        explanation: `You used "${k}" ${n} times. ${syn.note}`,
        example: `Exemple : « Ce voyage a été ${syn.alts[0]}. » (adapt to your sentence)`,
        alternatives: syn.alts.slice(1),
      });
    } else if (syn && n === 1 && ["chose", "choses", "faire", "intéressant"].includes(k)) {
      items.push({
        kind: "more_precise",
        original: first,
        sentence: sentenceContaining(text, first),
        suggestion: syn.alts[0],
        english: syn.english,
        translation_type: "contextual",
        explanation: syn.note,
        example: `Exemple : « Un ${syn.alts[0]} m'a surpris. » (adapt to your sentence)`,
        alternatives: syn.alts.slice(1),
      });
    }
  }

  return {
    summary:
      `The demo found ${items.length} vocabulary point${items.length === 1 ? "" : "s"}: repeated words and a few vague words. ` +
      "Connect Claude for context-aware word choice, false friends and register.",
    items,
  };
}

// ---------- Lens: complexity ----------

const STRUCTURES: { name: string; re: RegExp }[] = [
  { name: "Relative clause (qui / dont / où)", re: /\p{L}+\s+(qui|dont|où)\s+\p{L}+[^.!?]*/iu },
  { name: "Conditional (si + imparfait / conditionnel)", re: /(?<!\p{L})s(?:i\s+|['’])\p{L}+\s+\p{L}+(ais|ait|ions|iez|aient)(?!\p{L})[^.!?]*/iu },
  { name: "Concession (même si, bien que, pourtant, cependant, malgré)", re: /(?<!\p{L})(même si|bien que|bien qu['’]|pourtant|cependant|malgré|alors que)(?!\p{L})[^.!?]*/iu },
  { name: "Cause and effect (parce que, puisque, car, donc, c'est pourquoi)", re: /(?<!\p{L})(parce que|parce qu['’]|puisque|car|donc|c['’]est pourquoi|grâce à)(?!\p{L})[^.!?]*/iu },
  { name: "Temporal clause (quand, lorsque, dès que, avant de, après avoir)", re: /(?<!\p{L})(quand|lorsque|dès que|pendant que|avant de|après avoir|après être)(?!\p{L})[^.!?]*/iu },
];

function demoComplexity(text: string): ComplexityResult {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => words(s).length);
  const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;

  const strengths: ComplexityResult["strengths"] = [];
  for (const st of STRUCTURES) {
    const s = sentences.find((x) => st.re.test(x));
    if (s) {
      const m = s.match(st.re)!;
      strengths.push({ structure: st.name, excerpt: m[0].trim().split(/\s+/).slice(0, 10).join(" ") });
    }
  }

  const opportunities: ComplexityOpportunity[] = [];

  // 1. Short sentence followed by one starting with a subject pronoun → relative clause
  for (let i = 0; i < sentences.length - 1 && opportunities.length < 4; i++) {
    const a = sentences[i];
    const b = sentences[i + 1];
    const mb = b.match(/^(Il|Elle|Ils|Elles)\s+(.*)$/);
    if (mb && words(a).length <= 10 && /[.!]$/.test(a)) {
      const suggestion = `${a.replace(/[.!]$/, "")}, qui ${mb[2]}`;
      opportunities.push({
        original_sentence: `${a} ${b}`,
        suggestion,
        structures: ["Relative clause with qui"],
        explanation:
          "When a sentence starts with a pronoun that refers back to a noun at the end of the previous sentence, the two can often be joined with qui. The relative clause attaches the new information directly to the noun it describes.",
        try_it: "Try rewriting these two sentences yourself as one, using qui, or dont if the second idea uses de.",
      });
    }
  }

  // 2. "X parce que Y" → "Comme Y, X"
  for (const s of sentences) {
    if (opportunities.length >= 4) break;
    const m = s.match(/^(.+?)\s+parce qu(?:e\s+|'|’)(.+?)([.!?]*)$/i);
    if (m) {
      const main = m[1].charAt(0).toLowerCase() + m[1].slice(1);
      const cause = m[2].replace(/^(il|elle|on|ils|elles|j)/i, (x) => x.toLowerCase());
      opportunities.push({
        original_sentence: s,
        suggestion: `Comme ${cause.startsWith("il") || cause.startsWith("elle") ? "" : ""}${cause}, ${main}${m[3] || "."}`,
        structures: ["Causal clause with comme, placed first"],
        explanation:
          "Parce que answers the question 'why?' and usually follows the main clause. Comme presents a cause the reader can take as given, and it always comes first. Putting the cause first shifts the emphasis onto the consequence.",
        try_it: "Try rewriting the sentence yourself with puisque or étant donné que, and notice how the tone changes.",
      });
    }
  }

  // 3. "A, mais B" → "Même si A, B"
  for (const s of sentences) {
    if (opportunities.length >= 4) break;
    const m = s.match(/^(.+?),?\s+mais\s+(.+?)([.!?]*)$/i);
    if (m && words(m[1]).length >= 3) {
      const first = m[1].charAt(0).toLowerCase() + m[1].slice(1);
      opportunities.push({
        original_sentence: s,
        suggestion: `Même si ${first}, ${m[2]}${m[3] || "."}`,
        structures: ["Concessive clause with même si (+ indicatif)"],
        explanation:
          "Mais simply sets two ideas side by side. A concessive clause makes the logic explicit: the first fact is acknowledged, and the main clause holds despite it. Même si takes the indicative.",
        try_it: "Try the same sentence with bien que, which requires the subjunctive (bien qu'il soit…, bien que j'aie…).",
      });
    }
  }

  // 4. Long run of "et"
  for (const s of sentences) {
    if (opportunities.length >= 4) break;
    if ((s.match(/\bet\b/g) ?? []).length >= 2) {
      opportunities.push({
        original_sentence: s,
        suggestion: s.replace(/\bet\b(?![\s\S]*\bet\b)/, "si bien que"),
        structures: ["Consequence clause with si bien que"],
        explanation:
          "A chain of et lists events without saying how they relate. If the last event is a consequence of the others, si bien que (or de sorte que) makes that relationship visible. Only use it if a consequence is really what you mean.",
        try_it: "Look at the links between the ideas in this sentence and try rewriting it with a connector that names the relationship: cause, consequence, contrast or time.",
      });
    }
  }

  const variety =
    sentences.length < 2
      ? "There is only one sentence, so variety cannot be judged yet."
      : `Your ${sentences.length} sentences average ${avg.toFixed(1)} words (shortest ${Math.min(...lengths)}, longest ${Math.max(...lengths)}). ${
          Math.max(...lengths) - Math.min(...lengths) < 6
            ? "They are quite similar in length; mixing short, punchy sentences with longer, linked ones gives the text more rhythm."
            : "There is good variation in length, which gives the text rhythm."
        }`;

  return {
    summary:
      (strengths.length
        ? `You already use ${strengths.length} type${strengths.length > 1 ? "s" : ""} of complex structure. `
        : "Your sentences are mostly simple, independent clauses. ") +
      "The demo analysis spots a few mechanical patterns; with Claude connected you get suggestions tailored to your meaning.",
    strengths,
    sentence_variety: variety,
    opportunities,
  };
}

export function runDemoAnalysis<L extends Lens>(text: string, lens: L): LensResult[L] {
  switch (lens) {
    case "grammar":
      return demoGrammar(text) as LensResult[L];
    case "vocabulary":
      return demoVocabulary(text) as LensResult[L];
    case "mixing":
      return demoMixing(text) as LensResult[L];
    case "complexity":
      return demoComplexity(text) as LensResult[L];
    default:
      throw new Error(`Unknown lens: ${lens satisfies never}`);
  }
}
