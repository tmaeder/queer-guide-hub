-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915175902 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
update public.events e
   set queer_village_id = pick.village_id
  from (
    select c.event_id, (array_agg(c.village_id))[1] as village_id
      from (
        select a.entity_id as event_id, q.id as village_id
          from public.unified_tag_assignments a
          join public.unified_tags t on t.id = a.tag_id and a.entity_type = 'event'
          join (values ('kreuzberg','kreuzberg'), ('schoneberg','schoeneberg'),
                       ('neukolln','neukoelln'), ('friedrichshain','friedrichshain'),
                       ('prenzlauer','prenzlauer-berg'), ('mitte','mitte')
               ) as m(tag_slug, village_slug) on m.tag_slug = t.slug
          join public.queer_villages q on q.slug = m.village_slug
      ) c
     group by c.event_id
    having count(distinct c.village_id) = 1
  ) pick
 where e.id = pick.event_id
   and e.queer_village_id is null;;
