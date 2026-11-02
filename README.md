# French Writing Lab

*Think first. Write freely. Analyze afterward. Learn to express more.*

A calm writing studio for intermediate (B1–B2) French learners. You write in a blank space, with no corrections, suggestions or prompts, mixing in English whenever a French word won't come. When you're done, you submit the draft and look at it through four separate lenses powered by Claude: **Grammar**, **Vocabulary**, **Language mixing** and **Sentence complexity**.

## Stack

- Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript
- Tailwind CSS v4 (design tokens in `src/app/globals.css`)
- Supabase: Postgres, Auth, Row Level Security
- Claude API (`@anthropic-ai/sdk`) with structured outputs validated by Zod
- Deploys to Vercel with no extra config

## Quick start (demo mode, no credentials)

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. With no environment variables set, the app runs fully in **demo mode**:

- Drafts, analyses and vocabulary are stored in your browser's `localStorage`.
- Analysis comes from a built-in, rule-based demo analyzer (`src/lib/analysis/demo.ts`). It is anchored to your actual text, so highlighting, lens switching and saving vocabulary all work end to end. Every demo result is labelled as such.

## Configuring Claude

1. Create an API key at https://platform.claude.com.
2. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY=...`.
3. Restart the dev server.

The key is only read on the server, in `src/lib/analysis/service.ts` (marked `server-only`), and is never sent to the browser. Details:

- Model: `claude-haiku-5-5` by default for every lens, the lowest-cost option at a fraction of a cent per lens. `ANTHROPIC_MODEL` changes all lenses; `ANTHROPIC_MODEL_GRAMMAR`, `_VOCABULARY`, `_MIXING` and `_COMPLEXITY` change one lens (e.g. `ANTHROPIC_MODEL_COMPLEXITY=claude-sonnet-5-5`, about 20× Haiku's cost for that lens). Decide with the evaluation suite below rather than by guess.
- Output is capped at 8,000 tokens per lens (reasoning + JSON), which bounds the cost of a runaway response. Each call logs one JSON line with lens, model and token counts (never the learner's text), visible in Vercel's function logs.
- Each lens is one request to `client.beta.messages.parse()` with a Zod schema passed as `output_config.format`. That makes Claude return JSON matching the schema, which is then validated again before the UI sees it.
- `output_config.effort: "medium"`. Thinking is adaptive (always on for this model).
- On models that support it (Sonnet 5.5, Opus 5.5), server-side refusal fallback is on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Haiku doesn't support it, so the setting is left out for Haiku.
- Visit `/api/status` on your deployment to check the configuration. It returns `{"ai": true, "models": {...per lens...}, "protection": "password"}` once the key is picked up, and never shows a secret.
- Rate limits, authentication errors, connection failures, refusals, truncation and invalid output each return a clear message, along with a flag saying whether retrying makes sense.

## Protecting your credits (required before production)

`/api/analyze` is the only route that spends money. It enforces, in order:

1. **Same-origin check**: cross-site browser requests are refused (403).
2. **Access**: a signed-in Supabase user if Supabase is configured; otherwise a valid session from the access password (`APP_ACCESS_PASSWORD`). **If neither is configured and a Claude key is present, production refuses to analyze (503)**, so a forgotten setting can't leave the site open. Demo mode (no key) spends nothing and stays open.
3. **Request validation**: JSON only (415), 100 KB body cap and 20,000-character draft cap (413), lens must be one of the four (400).
4. **De-duplication**: identical requests already running share one model call; the page also ignores double clicks.
5. **Rate limit** per person (signed-in user, access session, or IP): 6 per minute and 40 per hour by default (`ANALYSIS_LIMIT_PER_MINUTE`, `ANALYSIS_LIMIT_PER_HOUR`), answered with 429 and `Retry-After`.

The access password:
- Set `APP_ACCESS_PASSWORD` in Vercel to a long random passphrase. Visitors get a short access screen; a correct password sets an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie signed with a key derived from the password, valid 30 days. Changing the password signs everyone out. "Lock" in the header ends the session.
- Failed attempts are limited to 8 per 15 minutes per IP. The password is compared in constant time and never sent to the browser.

**Application rate limits are not a spending cap.** They live in each server instance's memory, so on Vercel several instances each keep their own counters, and they reset when an instance restarts. The hard cap is set at the provider:

- In the Claude Console (https://platform.claude.com) → **Settings → Limits**, set a **monthly spend limit** you are comfortable losing in the worst case.
- Keep auto-reload of credits **off** (Settings → Billing) unless you want spending to continue past the prepaid balance.
- Use a key dedicated to this app, so you can revoke it without affecting anything else.

## Configuring Supabase

1. Create a project at https://supabase.com.
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`. (With the Supabase CLI you can run `supabase db push` instead.) The migration creates:
   - `profiles`: one row per user, created by a trigger when someone signs up
   - `drafts`: the working `content`, the immutable `original_text` (the first submission) and `submitted_text` (the latest submission)
   - `draft_analyses`: lens, `source_text`, the `result` JSON, a demo flag, model and timestamp
   - `vocabulary_items`: French, English, explanation, source sentence, the lens it came from, reviewed flag and date
   - RLS policies so every user can only read and write their own rows. A trigger also prevents `original_text` from ever being overwritten.
3. In **Project Settings → API**, copy the project URL and the anon key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` and your production `https://<domain>/auth/callback` to the redirect URLs. Email/password sign-in is used. Turn off "Confirm email" if you want instant sign-up while testing.

Once Supabase is configured, signed-out visitors are redirected to `/login` by `src/proxy.ts`, and `/api/analyze` rejects unauthenticated requests so your Claude credits can't be used anonymously.

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel. The framework is detected automatically.
2. Add the environment variables from `.env.example` under **Settings → Environment Variables** (Production and Preview).
3. Deploy, then add `https://<your-domain>/auth/callback` to Supabase's redirect URLs.

`/api/analyze` sets `maxDuration = 120` because an analysis with thinking can take 20–60 seconds. Environment-variable changes take effect on the next deployment (Vercel → Deployments → Redeploy).

## Project structure

```
src/
  app/
    page.tsx                 Write (default screen)
    drafts/page.tsx          My Drafts
    drafts/[id]/page.tsx     Analysis workspace
    vocabulary/page.tsx      My Vocabulary
    login/page.tsx           Sign in / sign up (Supabase mode only)
    auth/callback/route.ts   Email-confirmation code exchange
    api/analyze/route.ts     POST {text, lens} → structured analysis (guarded)
    api/access/route.ts      Access password → session cookie (POST), lock (DELETE)
    api/status/route.ts      Non-secret configuration check
    access/page.tsx          Access-password screen
  components/
    WritingWorkspace.tsx     Editor, autosave, local backup, submit
    analysis/                Lens tabs, highlighting, per-lens result views
    Nav.tsx
  lib/
    analysis/schemas.ts      Zod schemas + TS types per lens (single source of truth)
    analysis/prompts.ts      System prompt + per-lens instructions
    analysis/service.ts      Reusable server-side Claude analysis service
    analysis/demo.ts         Rule-based demo analyzer
    store/                   DataStore interface; LocalStore (demo) + SupabaseStore
    supabase/                Browser/server clients and config
    locate.ts                Maps quoted excerpts to validated character offsets
    security/                Access sessions, request guard, rate limiter
  proxy.ts                   Page gate: access password or Supabase session (Next 16 "proxy")
supabase/migrations/0001_init.sql
supabase/tests/              RLS/trigger tests run by scripts/test-db.sh
tests/unit/                  Vitest: security, route handlers, service, prompts/schemas, locate
e2e/                         Playwright: full learner flow + security
evals/                       Model-quality evaluation: fixtures, checks, runner
```

## How it behaves

**Writing.** The editor has spellcheck, autocorrect, autocapitalize and Grammarly turned off. Every keystroke is backed up to `localStorage` straight away, and the draft is saved to the store about 0.9 s after you stop typing, when you leave the tab, when the editor loses focus, or when you press ⌘/Ctrl+S. The status line always shows one of: Nothing to save yet · Unsaved changes · Saving… · Saved HH:MM · Not saved to your account (kept on this device). After a refresh, any text newer than the last server save is recovered from the backup. A row in the database is created only once you actually type something.

**Submitting.** The exact text is saved as `submitted_text`, and also as `original_text` the first time. You then land on the analysis workspace. No lens runs automatically.

**Lenses.** A lens runs only when you open it. Its result is stored and reused, so switching lenses or reloading the page never re-runs an analysis. Re-analyze is a manual action. Each lens has one job:

- **Grammar**: genuine errors, classified as *error*, *unclear passage* (several plausible meanings, listed) or *optional style suggestion*, each with a category (grammar, agreement, conjugation, word order, article/preposition, spelling/accent, punctuation, style), the sentence in context, valid alternatives and the model's own confidence estimate (not a measured probability). The prompt makes the model read the whole draft and infer subject and tense from context before correcting.
- **Vocabulary**: French word choice only: words that don't fit, more precise words, repetition, and enrichment (explicitly marked as "your word is correct"). It ignores English words.
- **Language mixing**: English words and phrases, with a contextual (not merely dictionary) French equivalent.
- **Sentence complexity**: 0–4 opportunities that keep the learner's meaning; no forced complexity. "Try it yourself" attempts are stored in the browser per analysis run.

**Highlighting.** The server converts each quoted excerpt into character offsets, anchored to the sentence the model quoted, tolerant of quote/apostrophe/spacing differences, and validated against the analysed text. If a passage can't be matched safely it is not highlighted anywhere else; the card says so.

**Revising.** "Continue editing" reopens a submitted draft. Your edits change `content` only. "Analyze my writing" (or "Analyze latest revision") updates `submitted_text`, while the original submission stays available through "Show original submission".

## Implemented features

- Distraction-free writing space: word count, autosave, save status, local crash backup, unload guard (Supabase mode)
- Four independently selectable, cached analysis lenses with typed JSON schemas and text highlighting
- Grammar errors kept separate from vocabulary gaps, stylistic suggestions and complexity opportunities, both in the prompts and in the UI
- Language-mixing detection that accounts for English loanwords used in French (week-end, parking…)
- Vocabulary bank: save from lenses or add manually, search, filter by reviewed/to review, mark reviewed, delete
- Draft library: created date, word count, status, open analysis, continue editing, delete
- Original submission kept separate from later revisions, in both stores and enforced by a database trigger
- Supabase auth with RLS. Full demo mode with no credentials at all
- Responsive layout (desktop-first), reduced-motion support

## Tests

```bash
npm run typecheck && npm run lint
```

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run test:db
```

- `npm test`: Vitest unit and route-handler tests (security, rate limits, validation, de-duplication, service error mapping with a mocked Claude client, schemas, prompts, highlighting). No network.
- `npm run test:e2e`: builds, starts the app in password mode with no Claude key (demo analyzer, spends nothing) and runs the full learner flow plus security checks in Chromium.
- `npm run test:db`: applies the migration to a throwaway local PostgreSQL with a stub of Supabase's `auth` schema and checks RLS isolation, immutability of the original submission and cascades. Needs PostgreSQL server binaries; touches no existing database.

## Evaluating model quality

`evals/` holds 12 synthetic cases (correct French that must not be corrected, genuine and subtle errors, ambiguous tense, English insertions, wrong word choice, correct-but-unnatural writing, simple and already-sophisticated sentences) with automatic checks.

```bash
npm run eval
```

```bash
npm run eval -- --live --models claude-haiku-5-5,claude-sonnet-5-5
```

The first command is a dry run that prints the plan and an estimated cost (about $0.04 for Haiku and $0.90 for Sonnet for the full suite). `--live` calls the API with `ANTHROPIC_API_KEY` from your environment and writes raw outputs, per-check results, token usage and latency to `evals/results/<timestamp>/`. Use `--lenses complexity` or `--cases id1,id2` to run a subset. Automatic checks catch clear failures; read the raw outputs for teaching quality.

## Known limitations

- **Model quality has not been measured live.** The evaluation suite exists, but no API key was available where it was built. Run it before changing models.
- **Hosted Supabase has not been exercised.** The migration's RLS and triggers are tested on PostgreSQL, but Supabase Auth, the REST API round-trips in `SupabaseStore`, and multi-device sessions have not been run against a real project.
- Rate limits are per server instance (in memory); the Claude Console spend limit is the real cap.
- The demo analyzer is rule-based. It catches a handful of common patterns (elision, contractions, être auxiliary, si + conditional, *beaucoup des*), uses a small built-in dictionary of about 250 words, and makes mechanical complexity suggestions. It is meant for testing the product, not for teaching.
- Demo-mode data lives in one browser. Clearing site data deletes it, and there is no migration from demo mode to an account.
- Highlighting depends on the model quoting the draft closely. Small quoting differences are tolerated; anything else is listed but not highlighted (the card says so).
- Analyses are not streamed; the learner sees a loading state for the 20–60 seconds a lens can take.
- "Try it yourself" attempts stay in the browser and belong to one analysis run; after Re-analyze the new run starts with empty boxes. No spaced-repetition review for vocabulary yet.
- Drafts have no title; the list shows an excerpt instead. Only the original submission and the latest version are kept, not a full revision history.
