-- ============================================================================
-- Clear is_adult on unambiguous civic/rights false-positives
-- ----------------------------------------------------------------------------
-- A handful of plainly-civic tags were flagged is_adult=true ("Freedom Of
-- Speech/Religion/Assembly/Association/Movement/Expression", "Right To Food"),
-- gating them from SEO. Unlike is_sensitive, is_adult is NOT broadly
-- over-applied — the adult vocabulary is euphemistic (BBC, Crops, Gold, Owner,
-- Gimp), so "no adult signal" is NOT a safe clear rule. Only an explicit,
-- unambiguous civic/rights/legal allowlist (with a strict adult/kink/anatomy
-- keep-guard) is cleared here; everything else stays gated for human review.
--
-- Reuses tag_sensitivity_cleanup_backup_20260618 (adds prev_is_adult column)
-- for reversibility.
-- ============================================================================
alter table public.tag_sensitivity_cleanup_backup_20260618
  add column if not exists prev_is_adult boolean;

with cand as (
  select id, is_adult, sensitive_topics, seo_indexable
  from public.unified_tags
  where status='active' and is_adult is true
    and name ~* '\m(freedom of|right to|human rights|civil rights|rights movement|rights act|court|tribunal|legislation|constitution|democracy|censorship|poverty|refugee|asylum|discrimination|racism|repression|fair trial|press freedom|hate crime|hate speech|genocide|apartheid|colonialism|suffrage|parliament|supreme court|due process)\M'
    and name !~* '\m(sex|bdsm|kink|fetish|bondage|domme|dom|sub|slave|master|leather|puppy|pup|fisting|cum|porn|escort|nude|naked|orgy|cruising|bareback|chastity|spank|whip|gag|collar|latex|rubber|diaper|abdl|watersport|scat|piss|anal|oral|genital|penis|vagina|vulva|labia|clit|nipple|breast|cock|dick|pussy|tit)\M'
)
insert into public.tag_sensitivity_cleanup_backup_20260618 (id, prev_is_sensitive, prev_sensitive_topics, prev_seo_indexable, prev_is_adult)
select id, null, sensitive_topics, seo_indexable, is_adult from cand
on conflict (id) do update set prev_is_adult = excluded.prev_is_adult;

update public.unified_tags t
set is_adult = false,
    seo_indexable = case when t.is_sensitive is true and t.human_reviewed is not true then t.seo_indexable else true end
from public.tag_sensitivity_cleanup_backup_20260618 b
where b.id = t.id and b.prev_is_adult is true
  and t.is_adult is true and t.status='active'
  and t.name ~* '\m(freedom of|right to|human rights|civil rights|rights movement|rights act|court|tribunal|legislation|constitution|democracy|censorship|poverty|refugee|asylum|discrimination|racism|repression|fair trial|press freedom|hate crime|hate speech|genocide|apartheid|colonialism|suffrage|parliament|supreme court|due process)\M';
