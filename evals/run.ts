/**
 * Evaluation runner: sends the synthetic cases in evals/fixtures.ts to one or more
 * models, applies the checks in evals/checks.ts, and writes raw outputs + results.
 *
 *   npm run eval                      # dry run: shows the plan and an estimated cost, spends nothing
 *   npm run eval -- --demo            # runs the built-in demo analyzer (checks the pipeline, NOT model quality)
 *   npm run eval -- --live --models claude-haiku-5-5,claude-sonnet-5-5 [--lenses complexity] [--cases id1,id2]
 *
 * --live needs ANTHROPIC_API_KEY and spends credits. Results: evals/results/<timestamp>/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runDemoAnalysis } from "../src/lib/analysis/demo";
import type { Lens, LensResult } from "../src/lib/analysis/schemas";
import { runClaudeAnalysis } from "../src/lib/analysis/service";
import { checkComplexity, checkGrammar, checkMixing, checkVocabulary, type CheckResult } from "./checks";
import { CASES, LENS_ORDER } from "./fixtures";

const PRICE: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};
// Rough per-call token guesses for the dry-run estimate (instructions+schema+draft in; reasoning+JSON out).
const EST_IN = 1900;
const EST_OUT = 4000;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const live = flag("live");
const demo = flag("demo");
const models = demo ? ["demo"] : (arg("models") ?? "claude-haiku-5-5,claude-sonnet-5-5").split(",").map((s) => s.trim());
const lensFilter = arg("lenses")?.split(",") as Lens[] | undefined;
const caseFilter = arg("cases")?.split(",");

const jobs = CASES.filter((c) => !caseFilter || caseFilter.includes(c.id)).flatMap((c) =>
  LENS_ORDER.filter((l) => c.lenses[l] && (!lensFilter || lensFilter.includes(l))).map((lens) => ({ c, lens })),
);

function check(lens: Lens, result: LensResult[Lens], expect: unknown): CheckResult[] {
  switch (lens) {
    case "grammar":
      return checkGrammar(result as LensResult["grammar"], expect as never);
    case "vocabulary":
      return checkVocabulary(result as LensResult["vocabulary"], expect as never);
    case "mixing":
      return checkMixing(result as LensResult["mixing"], expect as never);
    case "complexity":
      return checkComplexity(result as LensResult["complexity"], expect as never);
  }
}

async function main() {
  console.log(`${jobs.length} lens runs per model × ${models.length} model(s): ${models.join(", ")}`);
  if (!live && !demo) {
    for (const m of models) {
      const p = PRICE[m];
      const est = p ? (jobs.length * (EST_IN * p.in + EST_OUT * p.out)) / 1e6 : NaN;
      console.log(`  ${m}: ~$${est.toFixed(3)} (estimate; actual usage is recorded on --live)`);
    }
    console.log("Dry run only. Add --live to call the API (spends credits) or --demo to test the pipeline.");
    return;
  }
  if (live && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set: cannot run a live evaluation.");
    process.exit(2);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(import.meta.dirname, "results", stamp);
  mkdirSync(dir, { recursive: true });
  const summary: Record<string, Record<string, { pass: number; total: number; inTok: number; outTok: number; ms: number; failed: string[] }>> = {};

  for (const model of models) {
    const rows = [];
    summary[model] = {};
    for (const { c, lens } of jobs) {
      const t0 = Date.now();
      let result: LensResult[Lens] | null = null;
      let usage = { input_tokens: 0, output_tokens: 0 };
      let error: string | null = null;
      try {
        if (demo) result = runDemoAnalysis(c.text, lens);
        else ({ result, usage } = await runClaudeAnalysis(c.text, lens, model));
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      const ms = Date.now() - t0;
      const checks = result ? check(lens, result, c.lenses[lens]) : [{ name: "valid structured output", pass: false, detail: error ?? "" }];
      const s = (summary[model][lens] ??= { pass: 0, total: 0, inTok: 0, outTok: 0, ms: 0, failed: [] });
      s.pass += checks.filter((k) => k.pass).length;
      s.total += checks.length;
      s.inTok += usage.input_tokens;
      s.outTok += usage.output_tokens;
      s.ms += ms;
      for (const k of checks.filter((k) => !k.pass)) s.failed.push(`${c.id}: ${k.name}${k.detail ? ` (${k.detail})` : ""}`);
      rows.push({ case: c.id, covers: c.covers, lens, model, text: c.text, ms, usage, error, checks, result });
      process.stdout.write(`${model} ${c.id}/${lens}: ${checks.filter((k) => k.pass).length}/${checks.length}\n`);
    }
    writeFileSync(path.join(dir, `${model}.json`), JSON.stringify(rows, null, 2));
  }

  const lines = ["| model | lens | checks passed | input tok | output tok | est. cost | avg latency |", "|---|---|---|---|---|---|---|"];
  for (const [model, lenses] of Object.entries(summary)) {
    for (const [lens, s] of Object.entries(lenses)) {
      const p = PRICE[model];
      const cost = p ? `$${((s.inTok * p.in + s.outTok * p.out) / 1e6).toFixed(4)}` : "—";
      const runs = jobs.filter((j) => j.lens === lens).length;
      lines.push(`| ${model} | ${lens} | ${s.pass}/${s.total} | ${s.inTok} | ${s.outTok} | ${cost} | ${Math.round(s.ms / runs)} ms |`);
    }
  }
  const failures = Object.entries(summary).flatMap(([m, ls]) => Object.entries(ls).flatMap(([l, s]) => s.failed.map((f) => `- ${m} / ${l} / ${f}`)));
  const report = `# Eval ${stamp}\n\n${demo ? "> DEMO analyzer run: validates the pipeline only, not model quality.\n\n" : ""}${lines.join("\n")}\n\n## Failed checks\n${failures.join("\n") || "none"}\n`;
  writeFileSync(path.join(dir, "summary.md"), report);
  console.log("\n" + report + `\nWritten to ${dir}`);
}

main();
