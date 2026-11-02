-- Behavioural tests for supabase/migrations/0001_init.sql.
-- Each block raises an exception (failing the run) if the expectation is not met.
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''

insert into auth.users (id, email) values (:A, 'a@example.test'), (:B, 'b@example.test');

-- Acting as a user: `set request.jwt.claim.sub = <uuid>` (what Supabase derives from the JWT).

do $$ begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'FAIL profiles not created by trigger'; end if;
  raise notice 'PASS profiles created on sign-up';
end $$;

-- ---------- user A creates data ----------
set request.jwt.claim.sub = :A;
set role authenticated;
insert into public.drafts (id, user_id, content) values ('11111111-1111-1111-1111-111111111111', :A, 'Bonjour, je suis A.');
insert into public.vocabulary_items (user_id, draft_id, french) values (:A, '11111111-1111-1111-1111-111111111111', 'la bibliothèque');
insert into public.draft_analyses (draft_id, user_id, lens, source_text, result)
  values ('11111111-1111-1111-1111-111111111111', :A, 'grammar', 'Bonjour, je suis A.', '{"summary":"","issues":[]}');
reset role;

-- ---------- isolation: B sees and changes nothing of A's ----------
set request.jwt.claim.sub = :B;
set role authenticated;
do $$ begin
  if (select count(*) from public.drafts) <> 0 then raise exception 'FAIL B can read A''s drafts'; end if;
  if (select count(*) from public.vocabulary_items) <> 0 then raise exception 'FAIL B can read A''s vocabulary'; end if;
  if (select count(*) from public.draft_analyses) <> 0 then raise exception 'FAIL B can read A''s analyses'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL B can read other profiles'; end if;
  raise notice 'PASS B cannot read A''s rows';
end $$;

do $$ declare n int; begin
  update public.drafts set content = 'pwned' where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B updated A''s draft'; end if;
  delete from public.drafts where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B deleted A''s draft'; end if;
  delete from public.vocabulary_items;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B deleted A''s vocabulary'; end if;
  raise notice 'PASS B cannot update or delete A''s rows';
end $$;

do $$ begin
  begin
    insert into public.drafts (user_id, content) values ('aaaaaaaa-0000-0000-0000-000000000001', 'forged');
    raise exception 'FAIL B inserted a draft owned by A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.draft_analyses (draft_id, user_id, lens, source_text, result)
      values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'grammar', 'x', '{}');
    raise exception 'FAIL B attached an analysis to A''s draft';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.vocabulary_items (user_id, draft_id, french)
      values ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'x');
    raise exception 'FAIL B linked vocabulary to A''s draft';
  exception when insufficient_privilege then null;
  end;
  insert into public.vocabulary_items (user_id, french) values ('bbbbbbbb-0000-0000-0000-000000000002', 'le mot de B');
  raise notice 'PASS B cannot forge ownership or link to A''s draft; can create own rows';
end $$;
reset role;

-- ---------- anonymous visitors see nothing ----------
set request.jwt.claim.sub = '';
set role anon;
do $$ begin
  if (select count(*) from public.drafts) + (select count(*) from public.vocabulary_items)
     + (select count(*) from public.draft_analyses) + (select count(*) from public.profiles) <> 0 then
    raise exception 'FAIL anon can read data';
  end if;
  raise notice 'PASS anonymous role reads nothing';
end $$;
reset role;

-- ---------- the original submission is immutable ----------
set request.jwt.claim.sub = :A;
set role authenticated;
-- first submission (what SupabaseStore.submitDraft sends: no original_text)
update public.drafts set content = 'Version 1', submitted_text = 'Version 1', status = 'submitted', submitted_at = now()
  where id = '11111111-1111-1111-1111-111111111111';
-- revision + re-submission, plus a direct attempt to overwrite original_text and change owner
update public.drafts set content = 'Version 2', submitted_text = 'Version 2', original_text = 'tampered',
  user_id = 'bbbbbbbb-0000-0000-0000-000000000002'
  where id = '11111111-1111-1111-1111-111111111111';
do $$ declare d record; begin
  select * into d from public.drafts where id = '11111111-1111-1111-1111-111111111111';
  if d.original_text is distinct from 'Version 1' then raise exception 'FAIL original_text changed: %', d.original_text; end if;
  if d.submitted_text <> 'Version 2' or d.content <> 'Version 2' then raise exception 'FAIL revision not saved'; end if;
  if d.user_id <> 'aaaaaaaa-0000-0000-0000-000000000001' then raise exception 'FAIL owner changed'; end if;
  raise notice 'PASS original submission preserved; revision saved; owner unchanged';
end $$;

-- ---------- constraints ----------
do $$ begin
  begin
    insert into public.draft_analyses (draft_id, user_id, lens, source_text, result)
      values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'poetry', 'x', '{}');
    raise exception 'FAIL invalid lens accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS invalid lens rejected';
end $$;

-- ---------- deleting a draft: analyses go, vocabulary is kept ----------
delete from public.drafts where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select count(*) from public.draft_analyses) <> 0 then raise exception 'FAIL analyses not removed with draft'; end if;
  if (select count(*) from public.vocabulary_items where french = 'la bibliothèque' and draft_id is null) <> 1 then
    raise exception 'FAIL vocabulary lost or still linked after draft deletion';
  end if;
  raise notice 'PASS draft deletion cascades analyses and keeps vocabulary';
end $$;
reset role;

\echo ALL DATABASE TESTS PASSED
