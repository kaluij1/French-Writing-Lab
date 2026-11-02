@AGENTS.md

# French Writing Lab — engineering rules

Product philosophy: learners write freely with no prompts, corrections or suggestions; analysis happens only after submission, one lens at a time. Feedback helps the learner understand and rebuild their own French — it never replaces their text with AI French.

## Rules
- Keep the four lenses separate: Grammar (correctness), Vocabulary (French word choice/enrichment, never English words), Language Mixing (English insertions), Sentence Complexity (construction). Do not let one lens report another's concerns.
- Stylistic preferences are never presented as errors. Valid alternatives (la deuxième/la seconde) are never corrected.
- The original submission (`original_text`) is immutable. Never write code that overwrites it.
- `ANTHROPIC_API_KEY`, `APP_ACCESS_PASSWORD` and other secrets stay server-side. Never prefix them with `NEXT_PUBLIC_`.
- `/api/analyze` must reject unauthorised requests. Do not weaken the access gate, rate limits or request validation.
- Each lens runs only when opened; results are cached. Do not add background or speculative model calls.
- No gamification, no new features without approval, no new dependencies without justification.
- Never fabricate test or evaluation results. Never claim something works without running it.

## Commands
- `npm run lint` · `npm run typecheck` · `npm test` (unit) · `npm run test:e2e` (Playwright, builds first) · `npm run test:db` (RLS against local Postgres) · `npm run eval` (live model eval, needs `ANTHROPIC_API_KEY`, spends credits)
- `npm run build`
