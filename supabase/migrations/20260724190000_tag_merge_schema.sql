-- Merge-review queue: one row per actionable near-duplicate pair awaiting a decision.
create table if not exists public.tag_merge_review (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null references public.unified_tags(id) on delete cascade,
  duplicate_id uuid not null references public.unified_tags(id) on delete cascade,
  similarity numeric not null,
  lexical_variant boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','auto_merged')),
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  constraint tag_merge_review_distinct check (canonical_id <> duplicate_id)
);
create unique index if not exists tag_merge_review_pair_uniq
  on public.tag_merge_review (least(canonical_id,duplicate_id), greatest(canonical_id,duplicate_id));
create index if not exists tag_merge_review_status_idx on public.tag_merge_review (status);

-- Merge audit: the reversible record. snapshot holds the exact pre-merge state for unmerge.
create table if not exists public.tag_merge_audit (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null,
  duplicate_id uuid not null,
  canonical_slug text not null,
  duplicate_slug text not null,
  actor text not null default 'system',
  source text not null default 'manual',
  snapshot jsonb not null default '{}'::jsonb,
  is_reversed boolean not null default false,
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);
create index if not exists tag_merge_audit_dup_idx on public.tag_merge_audit (duplicate_id);

-- Lexical-variant test for the auto-merge guard: true when two slugs are near-identical strings
-- (substring, plural, or small edit distance) rather than merely semantically close.
create or replace function public.tag_slugs_are_variants(a text, b text)
returns boolean language sql immutable as $$
  select case
    when a is null or b is null then false
    when a = b then true
    when position(a in b) > 0 or position(b in a) > 0 then true
    when rtrim(a,'s') = rtrim(b,'s') then true
    when levenshtein(a, b) <= 2 then true
    else false
  end;
$$;

grant select on public.tag_merge_review, public.tag_merge_audit to authenticated, service_role;
