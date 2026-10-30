-- French Writing Lab — initial schema
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user, created automatically on sign-up)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Drafts
-- content         = working text (changes while writing / revising)
-- original_text   = exact text at first submission (immutable once set)
-- submitted_text  = exact text of the latest submission (what analyses refer to)
-- ---------------------------------------------------------------------------
create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null default '',
  original_text text,
  submitted_text text,
  status text not null default 'writing' check (status in ('writing', 'submitted')),
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create index if not exists drafts_user_updated_idx on public.drafts (user_id, updated_at desc);

create or replace function public.drafts_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- The original submission is preserved exactly: set once, never overwritten.
  if old.original_text is not null then
    new.original_text := old.original_text;
  elsif new.submitted_text is not null then
    new.original_text := new.submitted_text;
  end if;
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists drafts_preserve_original on public.drafts;
create trigger drafts_preserve_original
  before update on public.drafts
  for each row execute function public.drafts_before_update();

-- ---------------------------------------------------------------------------
-- Draft analyses (one row per lens run)
-- ---------------------------------------------------------------------------
create table if not exists public.draft_analyses (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lens text not null check (lens in ('grammar', 'vocabulary', 'mixing', 'complexity')),
  source_text text not null,
  result jsonb not null,
  demo boolean not null default false,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists draft_analyses_draft_idx on public.draft_analyses (draft_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Vocabulary items
-- ---------------------------------------------------------------------------
create table if not exists public.vocabulary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid references public.drafts (id) on delete set null,
  french text not null,
  english text not null default '',
  explanation text not null default '',
  source_sentence text not null default '',
  source_lens text not null default 'manual'
    check (source_lens in ('grammar', 'vocabulary', 'mixing', 'complexity', 'manual')),
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists vocabulary_items_user_created_idx on public.vocabulary_items (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: every user can only see and change their own rows.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.drafts enable row level security;
alter table public.draft_analyses enable row level security;
alter table public.vocabulary_items enable row level security;

drop policy if exists "profiles: own row" on public.profiles;
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "drafts: own rows" on public.drafts;
create policy "drafts: own rows" on public.drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "draft_analyses: own rows" on public.draft_analyses;
create policy "draft_analyses: own rows" on public.draft_analyses
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid())
  );

drop policy if exists "vocabulary_items: own rows" on public.vocabulary_items;
create policy "vocabulary_items: own rows" on public.vocabulary_items
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (draft_id is null or exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid()))
  );
