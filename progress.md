# Progress — Stabilisation mission

## Environment facts (verified)
- Stack: Next.js 16.4 (App Router, Cache Components, `proxy.ts`), React 19, TS, Tailwind v4, Supabase JS/SSR, `@anthropic-ai/sdk` 1.3, Zod 4.
- No `ANTHROPIC_API_KEY`, no Supabase credentials in this environment → live model evals and live Supabase tests are **blocked**.
- PostgreSQL 16 binaries available locally → migration/RLS/trigger logic can be tested against real Postgres with a stubbed `auth` schema.
- Git: clean at `5db5cd7`. No tests in repo. No CLAUDE.md.

## Verified problems (from code, not assumed)
1. `/api/analyze` is unauthenticated whenever Supabase is not configured (current production setup) → anyone can spend credits.
2. No rate limiting; body parsed with `request.json()` before any size check.
3. Vocabulary lens has `english_word` kind → duplicates Language Mixing (cost + confusion).
4. Grammar prompt/schema has no context-first rules, no style/ambiguity distinction, no spelling category, no sentence context, no confidence.
5. Highlighting: `findRanges` falls back to searching from index 0 → a repeated phrase can attach to the wrong occurrence; unlocated excerpts are dropped silently.
6. "Try it yourself" stored under `draftId.index` → after Re-analyze, an old attempt shows under a different opportunity.
7. `selectLens` guards with React state → a fast double-click can fire two requests.
8. Supabase path never exercised against a database.

## Plan
1. Security: access gate (Supabase if configured, else `APP_ACCESS_PASSWORD` with signed HttpOnly cookie), fail closed in production when Claude is configured but no protection exists, Origin check, body-size limit, per-identity rate limit, login brute-force limit, in-flight de-duplication (client + server).
2. Grammar: context-first prompt, new classification (kind + category + confidence), sentence context, valid alternatives; backwards-compatible rendering of stored analyses.
3. Highlighting: resolve excerpt → offsets server-side, anchored by sentence, validated; never attach to a wrong passage; show "not located" instead of silently dropping.
4. Lenses: remove English-word detection from Vocabulary; mark enrichment vs. error; tighten Mixing and Complexity prompts; fix Try-it keying.
5. Evals: fixtures + runner (Haiku vs Sonnet) in repo; run blocked without key → document.
6. Supabase: SQL test suite against local Postgres (RLS isolation, immutable original, ownership).
7. Tests in repo: Vitest (unit + route handler), Playwright (E2E), DB script. Lint, typecheck, build.

## Log
### Phase 2 — Security ✅
- Added `src/lib/security/{access,rate-limit,guard}.ts`, `src/app/api/access/route.ts`, `src/app/access/page.tsx`; rewrote `src/app/api/analyze/route.ts`; updated `src/proxy.ts`, `Nav.tsx`, `layout.tsx`, `api/status`.
- Modes: Supabase (if configured) → `APP_ACCESS_PASSWORD` signed HttpOnly cookie → none. **Fails closed** in production when a Claude key exists without protection (503).
- Origin/Sec-Fetch-Site check, 415 for non-JSON, 100 KB body cap + 20,000-char text cap (413), Zod validation, per-identity limiter (6/min, 40/h, env-tunable), login limiter (8 / 15 min / IP), in-flight coalescing of identical requests.
- Dev deps added (justified): vitest (unit/route tests), @playwright/test 1.63.0 (matches preinstalled Chromium), tsx (eval runner). `@types/node` 20→22 to match Node 22 runtime (vitest peer requirement).
- Tests: `npx vitest run` → 26/26 pass. Mutation check: disabling the session check + origin check made 3 tests fail (restored afterwards).
### Phase 3/4 — Grammar quality, highlighting, lens separation ✅ (code) · ⛔ live quality unverified
- `schemas.ts`: grammar issue now has `sentence`, `kind` (error/ambiguous/style), new `category` list (grammar, agreement, conjugation, word_order, article_preposition, spelling_accent, punctuation, style), `valid_alternatives`, `interpretations`, `confidence` (high/medium/low, labelled as a model estimate). Vocabulary kinds: incorrect_choice, more_precise, repetition, enrichment (`english_word` removed); `sentence` added.
- `prompts.ts`: grammar rewritten context-first (Boggle example, deuxième/seconde, mon autre amie, gagner≠error, accents = spelling, ambiguity). Vocabulary ignores English entirely; enrichment ≠ error. Mixing: contextual vs dictionary translation, game/brand names. Complexity: 0–4 (was a forced 2–5), no added ideas, naturalness.
- `src/lib/locate.ts` (replaces `highlight.ts`): sentence-anchored, length-preserving normalisation, punctuation-tolerant; returns null rather than attaching to another sentence. Server stores validated `locations`; client re-validates and recomputes for old analyses. Cards say when a passage couldn't be located.
- Fixes: Try-it attempts keyed per analysis run (legacy per-draft attempts preserved/migrated); client in-flight ref prevents double-click duplicate requests; output cap 16k→8k tokens.
- UI: grammar grouped into Errors / Unclear passages / Optional style suggestions; confidence, sentence, "Also correct"; style/ambiguous use a lighter dotted mark. Stored analyses with old categories/kinds still render.
- Tests: 58/58 unit tests pass (locate, lenses/schemas/prompts, service error mapping with mocked client, demo conformance).
### Phase 5 — Evaluation suite ✅ (framework) · ⛔ live run blocked
- `evals/fixtures.ts` (12 synthetic cases covering all 8 required categories), `evals/checks.ts` (conservative automatic checks incl. a content-word meaning-preservation signal for Complexity), `evals/run.ts` (dry run with cost estimate / `--demo` pipeline check / `--live`). Raw outputs + `summary.md` written to `evals/results/<timestamp>/` (git-ignored).
- `service.ts`: `runClaudeAnalysis(text, lens, model)` exported for the runner; per-lens override `ANTHROPIC_MODEL_<LENS>`; token usage logged per call (counts only).
- Dry run: 20 lens runs per model; estimate ≈ $0.044 Haiku, ≈ $0.876 Sonnet.
- Demo run (pipeline only, NOT model quality): grammar 18/30, vocabulary 5/7, mixing 8/9, complexity 13/13 — the misses are what a rule-based demo can't do, which shows the checks discriminate.
- **Blocked:** no `ANTHROPIC_API_KEY` in this environment, so no Haiku/Sonnet results exist. Nothing below claims model quality.

### Phase 6 — Supabase ✅ (SQL logic on real Postgres 16) · ⛔ hosted Supabase untested
- `scripts/test-db.sh` + `supabase/tests/{00_auth_stub,10_rls.test}.sql`: throwaway cluster, stub `auth` schema/roles, migration applied twice (idempotent), 8 behavioural checks: profile trigger, cross-user read/update/delete blocked, forged ownership blocked, cross-user draft links blocked, anon reads nothing, original_text immutable + owner immutable, lens constraint, cascade/keep-vocabulary on delete.
- Mutation checks: `using (true)` on drafts → "FAIL B can read A's drafts"; removing the original_text guard → "FAIL original_text changed: tampered". Migration restored unchanged.
- **Not tested:** hosted Supabase Auth (sign-up/sign-in, email confirmation), PostgREST + `SupabaseStore` round-trips, cross-device session. No credentials available.
### Phase 7 — Tests in repo ✅
- Vitest: `tests/unit/*` (62 tests). Playwright: `e2e/*` (13 tests, production build, password mode, demo analyzer). DB: `npm run test:db`.
- Bugs found by the new tests and fixed:
  1. Login limiter counted successful sign-ins → legitimate users locked out after 8 logins/15 min per IP. Now counts failures only (`RateLimiter.peek`).
  2. Cache Components keeps pages alive (React `<Activity>`): after submitting, "Continue editing" showed a permanently disabled "Submitting…" button. State is now reset when the page is shown.
  3. Same cause: after re-submitting a revision, the analysis page merged old lens results → previous version's analysis shown next to the new text with mismatched highlights. Lens state is now replaced, and only analyses of the exact on-screen text are displayed.
  4. A 200 response that isn't an analysis would be stored and crash rendering → client now validates the response shape.
  5. "Lock"/"Demo mode" in the header depended on build-time env → now read from `/api/status` at runtime.

### Final verification (clean `npm ci`, no `.next`)
- typecheck ✅ · lint ✅ · unit 62/62 ✅ · e2e 13/13 ✅ (incl. build) · db 8/8 ✅ · client bundle secret scan 0 matches ✅
- Real `next start`: key without protection → 503 ✅; password mode without session → 401, pages 307 → /access ✅.

### Blocked / needs owner
- Live Haiku vs Sonnet evaluation (needs `ANTHROPIC_API_KEY`; ≈ $0.92 for both models).
- Hosted Supabase verification (needs a project).
- Deployment: set `APP_ACCESS_PASSWORD` in Vercel **before** deploying, or analysis will return 503 (intended fail-closed behaviour).
