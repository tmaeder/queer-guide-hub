-- Revive 35 glossary entries hidden by an automated ZERO-USAGE rule that the
-- glossary rebuild made obsolete.
--
-- WHAT WAS ACTUALLY MEASURED, AND HOW IT CORRECTS AN EARLIER CLAIM
--
-- The open question was "4,052 deprecated tags still hold real prose — should
-- they be revived?", with the suspicion that an orphan sweep had hidden them on
-- usage rather than on merit. Reading `tag_change_log` rather than guessing
-- splits that number three ways, and MOST OF IT CONTRADICTS THE SUSPICION:
--
--   4,011  deprecated rows carrying >=200 chars of prose
--   3,298  also carry an explicit `admin:*` action -> DELIBERATE curation.
--            Reviving these would override a human decision. Left alone.
--     251  no logged reason at all -> no evidence either way. Left alone.
--      35  deprecated by `deprecate_unused_tags` and NEVER touched by an admin.
--
-- Only the last group is safely actionable, and it is 35 rows, not thousands.
-- An intermediate count of 462 was wrong: it matched rows the sweep touched
-- WITHOUT excluding rows an admin had also acted on, so it swept deliberate
-- decisions back in.
--
-- WHY THE RULE IS OBSOLETE RATHER THAN WRONG
--
-- `deprecate_unused_tags` hides `status='active' AND human_reviewed=false AND
-- usage_count=0`. That is defensible for auto-generated junk nobody ever used.
-- It stopped being defensible for THIS content when /tags was rebuilt as the
-- glossary — browse and search first (9a21fb270). A glossary entry does not
-- need a venue tagged with it to be worth reading. Zero usage means nobody has
-- tagged content with the term; it says nothing about whether the definition is
-- correct or wanted.
--
-- What was hidden by that rule:
--
--   decriminalization-of-homosexuality   a foundational LGBTQ+ legal concept
--   minority-rights, inalienable-rights, language-rights,
--   international-criminal-court         rights vocabulary
--   shade, yas, clock, gay-slang, fishnets   core queer slang
--   alcohol-poisoning, cross-tolerance, drug-interactions, inhalants,
--   naloxone-adjacent SSRIs and opioids      harm-reduction vocabulary
--   doxycycline, electrostimulation, testosterone-undecanoate  sexual health
--
-- SAFETY, CHECKED RATHER THAN ASSUMED. Across all 35:
--   0 lack a description        (so indexable_without_description stays 0)
--   0 carry a non-definition body (refusal artifact or the title repeated)
--   0 carry a known-wrong wikipedia_url
--   0 are is_adult or is_sensitive
--   0 are uncategorized
--   0 appear in the Kinktionary term index, so NONE carries the
--     non-commercial-licence exposure that the 435 verbatim-overlap pages do.
--
-- human_reviewed IS SET, AND THAT IS THE POINT. `deprecate_unused_tags` skips
-- `human_reviewed = true`, so the flag is the existing, intended escape hatch:
-- without it these rows are re-hidden the next time anyone runs the function.
-- The function is deliberately NOT changed here — it is on no cron and in no
-- admin_automations row, so it only runs when invoked, and its rule remains
-- correct for the unreviewed junk it was written for.
--
-- Reversible: status and human_reviewed are the only columns touched, and the
-- prior values are in tag_change_log via the audit trigger.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:revive-zero-usage-glossary-terms', true);

do $mig$
declare
  r      record;
  v_bad  int;
  v_done int := 0;
begin
  create temp table _revive (slug text primary key) on commit drop;
  insert into _revive (slug) values
    ('acid'), ('alcohol-poisoning'), ('boycotts'), ('chemicals'), ('clock'),
    ('clomipramine'), ('cross-tolerance'), ('dapoxetine'),
    ('decriminalization-of-homosexuality'), ('doxycycline'),
    ('drug-interactions'), ('drug-tourism'), ('ecstasy'), ('electrostimulation'),
    ('fishnets'), ('fluoxetine'), ('gay-slang'), ('hydrocodone'),
    ('inalienable-rights'), ('inhalants'), ('international-criminal-court'),
    ('international-solidarity'), ('language-rights'), ('lubricant'),
    ('minority-rights'), ('papaverine'), ('paroxetine'), ('priligy'), ('prozac'),
    ('public-awareness-campaigns'), ('sertraline'), ('shade'),
    ('testosterone-undecanoate'), ('tokenism'), ('yas');

  -- Every listed slug must exist and still be deprecated. A slug that has since
  -- been revived, merged or renamed by another session must not be silently
  -- skipped — this fails instead, so the list is re-derived rather than guessed.
  -- Aliased `rv`, NOT `r`. `r` is the declared record variable, and a table
  -- alias of the same name is shadowed by it: PL/pgSQL resolves `r.slug` to the
  -- variable, which is unassigned before the loop runs, and the migration dies
  -- with `record "r" is not assigned yet` (SQLSTATE 55000). That is exactly how
  -- this failed on its first apply — the rolled-back rehearsal used `rv`
  -- throughout, so it validated a different statement than the file shipped.
  select count(*) into v_bad from _revive rv
   where not exists (select 1 from public.unified_tags t where t.slug = rv.slug);
  if v_bad > 0 then
    raise exception 'glossary revival: % listed slug(s) do not exist', v_bad;
  end if;

  -- Refuse to publish anything that would breach the zero-invariants. Checked
  -- again here rather than trusting the authoring-time measurement, because the
  -- corpus moves under concurrent sessions.
  select count(*) into v_bad from _revive rv
    join public.unified_tags t on t.slug = rv.slug
   where coalesce(nullif(btrim(t.description), ''), t.short_description) is null
      or coalesce(t.long_description, '') ~* 'there is no (available|provided|specific) information'
      or lower(btrim(t.long_description)) = lower(btrim(t.name));
  if v_bad > 0 then
    raise exception 'glossary revival: % row(s) would publish an empty or non-definition page', v_bad;
  end if;

  for r in select rv.slug, t.id from _revive rv
             join public.unified_tags t on t.slug = rv.slug
            where t.status = 'deprecated' loop
    update public.unified_tags
       set status            = 'active',
           human_reviewed    = true,
           deprecated_at     = null,
           deprecation_reason = null,
           last_verified_at  = now(),
           updated_at        = now()
     where id = r.id;
    v_done := v_done + 1;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _revive rv
    join public.unified_tags t on t.slug = rv.slug
   where t.status <> 'active' or coalesce(t.human_reviewed, false) = false;
  if v_bad > 0 then
    raise exception 'glossary revival: % row(s) are not active-and-reviewed', v_bad;
  end if;

  -- Without human_reviewed the next run of deprecate_unused_tags re-hides them,
  -- which would make this migration a no-op with extra steps. Asserted against
  -- the function's own predicate.
  select count(*) into v_bad from _revive rv
    join public.unified_tags t on t.slug = rv.slug
   where t.status = 'active'
     and coalesce(t.human_reviewed, false) = false
     and coalesce((select usage_count from public.tag_usage_summary s where s.id = t.id), 0) = 0;
  if v_bad > 0 then
    raise exception 'glossary revival: % row(s) are still eligible for deprecate_unused_tags', v_bad;
  end if;

  -- Corpus-wide zero-invariant.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'glossary revival: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'glossary revival: % of % listed row(s) revived', v_done, (select count(*) from _revive);
end
$mig$;
