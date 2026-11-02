# Checks — requirements, commands, expected vs actual

Run from the repository root. "Actual" = result observed in the final clean run (fresh `npm ci`, no `.next`).

| # | Requirement | Command / method | Expected | Actual |
|---|---|---|---|---|
| 1 | Types | `npm run typecheck` | no errors | ✅ no errors |
| 2 | Lint | `npm run lint` | no errors/warnings | ✅ clean |
| 3 | Unit + route-handler tests | `npm test` | all pass | ✅ 62/62 (7 files) |
| 4 | Full learner flow + security in a browser (production build) | `npm run test:e2e` | all pass | ✅ 13/13 |
| 5 | RLS, immutable original, cascades (real PostgreSQL 16, stub auth) | `npm run test:db` | 8 PASS lines + "ALL DATABASE TESTS PASSED" | ✅ |
| 6 | Production build | part of `npm run test:e2e` | compiles | ✅ |
| 7 | No secret in client bundle | `grep -rlE 'sk-ant-\|APP_ACCESS_PASSWORD\|e2e-access-password' .next/static` + e2e scan of served JS with the password set | 0 matches | ✅ 0 |
| 8 | Fails closed with a key but no protection (real `next start`) | `ANTHROPIC_API_KEY=… next start`, POST `/api/analyze` | 503 | ✅ 503 |
| 9 | Unauthorised analysis rejected (real server, password mode) | POST without cookie | 401; pages 307 → `/access` | ✅ |
| 10 | Eval runner | `npm run eval` (dry) / `-- --demo` | plan + cost / pipeline runs | ✅ |
| 11 | Live model quality (Haiku vs Sonnet) | `npm run eval -- --live …` | results recorded | ⛔ **blocked: no ANTHROPIC_API_KEY here** |
| 12 | Hosted Supabase (auth, REST, multi-device) | manual, real project | sign-up/in, data round-trips | ⛔ **blocked: no Supabase project/credentials** |

## Mutation checks (tests proven able to fail)
- Disabled session check + origin check in the analyze guard → 3 route tests failed.
- Drafts RLS policy `using (true)` → `FAIL B can read A's drafts`.
- Removed `original_text` guard in trigger → `FAIL original_text changed: tampered`.
- Restored merge of stale lens state → e2e "drafts" failed with `Received: "Grammar5 notes"` (stale result shown next to revised text).
All mutations were reverted; final runs above are on the unmodified code.

## What the automated tests cover
- Writing: autosave status, refresh recovery (incl. keystrokes before the debounced save), blank page after submission.
- Submission & revisions: original preserved and viewable; re-submission does not show stale analyses.
- Analysis: each lens runs only when opened, exactly once; switching/reloading makes 0 extra calls; double click = 1 request; invalid model output / non-analysis 200 response / API errors give clear, retryable messages.
- Security: 401 without/with forged session, 403 cross-origin, 400/413/415 validation, 429 rate limit with Retry-After, login limiter counts failures only, HttpOnly/SameSite/Secure cookie, no secret in served JS or `/api/status`, coalescing of identical concurrent requests.
- Feedback plumbing: grammar schema/prompt rules (context-first, valid alternatives, spelling category, ambiguity); Vocabulary cannot emit English words; Mixing ignores loanwords (demo); highlights equal the passage their card explains; offsets are validated and never attached to another sentence.
- **Not covered by automated tests:** the educational quality of real Claude output (see item 11).
