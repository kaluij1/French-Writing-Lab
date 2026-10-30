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

- Model: `claude-opus-5-5` by default. Override it with `ANTHROPIC_MODEL`.
- Each lens is one request to `client.beta.messages.parse()` with a Zod schema passed as `output_config.format`. That makes Claude return JSON matching the schema, which is then validated again before the UI sees it.
- `output_config.effort: "medium"`. Thinking is adaptive (always on for this model).
- Server-side refusal fallback is on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). If the model declines a request, the API retries it on Anthropic's recommended fallback model.
- Rate limits, authentication errors, connection failures, refusals, truncation and invalid output each return a clear message, along with a flag saying whether retrying makes sense.

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

`/api/analyze` sets `maxDuration = 120` because an analysis with thinking can take 20–60 seconds. The "Demo mode" badge in the header is computed at build time, so redeploy after adding or removing keys.

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
    api/analyze/route.ts     POST {text, lens} → structured analysis
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
    highlight.ts             Maps quoted excerpts back to ranges in the draft
  proxy.ts                   Session refresh + auth redirect (Next 16 "proxy", formerly middleware)
supabase/migrations/0001_init.sql
```

## How it behaves

**Writing.** The editor has spellcheck, autocorrect, autocapitalize and Grammarly turned off. Every keystroke is backed up to `localStorage` straight away, and the draft is saved to the store about 0.9 s after you stop typing, when you leave the tab, when the editor loses focus, or when you press ⌘/Ctrl+S. The status line always shows one of: Nothing to save yet · Unsaved changes · Saving… · Saved HH:MM · Not saved to your account (kept on this device). After a refresh, any text newer than the last server save is recovered from the backup. A row in the database is created only once you actually type something.

**Submitting.** The exact text is saved as `submitted_text`, and also as `original_text` the first time. You then land on the analysis workspace. No lens runs automatically.

**Lenses.** A lens runs only when you open it. Its result is stored and reused, so switching lenses or reloading the page never re-runs an analysis. Re-analyze is a manual action. Highlights in the draft link to their explanation cards, and clicking a highlight scrolls to the card. Items in the Vocabulary and Language mixing lenses can be saved to your vocabulary. Complexity opportunities include a "Try it yourself" box (stored locally).

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

## Tested

The required flow was run end to end in headless Chromium against a production build (`next build && next start`) in demo mode: open → write a mixed French/English paragraph → autosave → refresh (draft persists, including unsaved keystrokes) → submit → open all four lenses (notes and highlights render) → click a highlight → save a vocabulary item → reload (cached analyses, zero new API calls) → My Vocabulary (item appears; search and reviewed filter work) → My Drafts → reopen → revise and re-analyze (original preserved) → Write opens a blank page. No console errors. `tsc`, `eslint` and `next build` all pass.

## Known limitations

- **The live Claude path and Supabase mode were not exercised end to end.** Neither credential was available in the build environment. The Claude service typechecks against the installed SDK and its errors are handled, but run one real analysis after adding your key. The same goes for sign-up, sign-in and RLS once you connect Supabase.
- The demo analyzer is rule-based. It catches a handful of common patterns (elision, contractions, être auxiliary, si + conditional, *beaucoup des*), uses a small built-in dictionary of about 250 words, and makes mechanical complexity suggestions. It is meant for testing the product, not for teaching.
- Demo-mode data lives in one browser. Clearing site data deletes it, and there is no migration from demo mode to an account.
- Excerpt highlighting depends on the model quoting the draft verbatim (the prompt requires it). A quote that can't be found is still listed but not highlighted.
- Analyses are not streamed; the learner sees a loading state for the 20–60 seconds a lens can take.
- There is no rate limiting beyond requiring sign-in, and no spaced-repetition review for vocabulary yet.
- Drafts have no title; the list shows an excerpt instead. Only the original submission and the latest version are kept, not a full revision history.
