-- Bluesky links on personality pages (Phase 6 per-surface of the AT Protocol plan).
--
-- Source: Wikidata P12361 ("Bluesky handle") on the personality's own
-- wikidata_qid, never a name match. Each handle was resolved live on
-- 2026-10-20 (app.bsky.actor.getProfile returned the same handle) and its
-- display name read against ours; 4 Wikidata handles no longer resolve and are
-- left out (clara-sorrenti, koby-falks, kevin-kuhnert, elizabeth-duval).
--   Audrey Tang -> @audreyt.org (Bluesky name: ⿻ Audrey Tang 唐鳳)
--   Becca Balint -> @balint.house.gov (Bluesky name: Representative Becca Balint)
--   Carla Antonelli -> @carlaantonelli.bsky.social (Bluesky name: Carla Antonelli)
--   Carolin Emcke -> @emcke.bsky.social (Bluesky name: Carolin Emcke)
--   Cassandra Peterson -> @therealelvira.bsky.social (Bluesky name: Elvira)
--   Chase Strangio -> @chasestrangio.bsky.social (Bluesky name: Chase Strangio)
--   Chelsea Manning -> @xychelsea.tv (Bluesky name: Chelsea Manning)
--   Chris Bryant -> @chrisbryant1962.bsky.social (Bluesky name: Chris Bryant)
--   George Takei -> @georgetakei.bsky.social (Bluesky name: George Takei)
--   Hormona Lisa -> @hormona-lisa.bsky.social (Bluesky name: Hormona Lisa)
--   Luxx Noir London -> @luxxofficial.bsky.social (Bluesky name: Luxx Noir London)
--   Margaret Cho -> @margaretcho.bsky.social (Bluesky name: Margaret Cho)
--   Michelangelo Signorile -> @msignorile.bsky.social (Bluesky name: Michelangelo Signorile)
--   Owen Jones -> @owenjones.bsky.social (Bluesky name: Owen Jones)
--   Parker Molloy -> @parkermolloy.com (Bluesky name: Parker Molloy)
--   Roderic O'Gorman -> @rodericogorman.bsky.social (Bluesky name: Roderic O’Gorman TD)
--   Roxane Gay -> @roxanegay.bsky.social (Bluesky name: Roxane Gay)
--   Sasha Colby -> @thesashacolby.bsky.social (Bluesky name: Sasha Colby)
--   Sharice Davids -> @davids.house.gov (Bluesky name: Rep. Sharice Davids)
--   Vivian Wilson -> @thevivllainous.bsky.social (Bluesky name: Vivian Jenna Wilson)
--
-- Fill-if-empty: an existing social_links.bluesky is never overwritten. Each row
-- is guarded on the wikidata_qid the handle came from, so a personality whose
-- QID has since been corrected gets nothing. The DID is recorded beside the
-- link (handles can change; the DID cannot).

with v(slug, qid, handle, did) as (values
  ('audrey-tang', 'Q15025', 'audreyt.org', 'did:plc:myh6qcwcvg53u3nqsvzkljq6'),
  ('becca-balint', 'Q28137193', 'balint.house.gov', 'did:plc:a4vpio4bg7nnvmwolyyw5t72'),
  ('carla-antonelli', 'Q2480827', 'carlaantonelli.bsky.social', 'did:plc:32ylproqm62ed63u55id4pyb'),
  ('carolin-emcke', 'Q1044329', 'emcke.bsky.social', 'did:plc:22j7q6b4gz65po3hoe7reiiu'),
  ('cassandra-peterson', 'Q253942', 'therealelvira.bsky.social', 'did:plc:t6knu7t4jhqxtwqrxlyg6hxc'),
  ('chase-strangio', 'Q30364277', 'chasestrangio.bsky.social', 'did:plc:wplzpr747m2xzqokjw6i4cus'),
  ('chelsea-manning', 'Q298423', 'xychelsea.tv', 'did:plc:7itws64acv3c6dsgab5ky6zn'),
  ('chris-bryant', 'Q266146', 'chrisbryant1962.bsky.social', 'did:plc:lyot25h5nqpfdy5tyixv22cj'),
  ('george-takei', 'Q110154', 'georgetakei.bsky.social', 'did:plc:y4zs4cabaezzwx3bz2e5nnj2'),
  ('hormona-lisa', 'Q131392030', 'hormona-lisa.bsky.social', 'did:plc:pfcqymgslnmhsdgsb6fj5ogx'),
  ('luxx-noir-london', 'Q116771728', 'luxxofficial.bsky.social', 'did:plc:uqqodocokuqfihmg6367zq27'),
  ('margaret-cho', 'Q257243', 'margaretcho.bsky.social', 'did:plc:rmkdrfxlffi3v2skf7qpccra'),
  ('michelangelo-signorile', 'Q1931006', 'msignorile.bsky.social', 'did:plc:3ezphbcb74zrirki5w3ql3ce'),
  ('owen-jones', 'Q1518861', 'owenjones.bsky.social', 'did:plc:kck4x62tvstln6zqiqr4ej5g'),
  ('parker-molloy', 'Q18001529', 'parkermolloy.com', 'did:plc:hf7ezrajxadu7v3tzcyij424'),
  ('roderic-o-gorman', 'Q16980123', 'rodericogorman.bsky.social', 'did:plc:qdwpyj5i3c2mzedvljv72v3z'),
  ('roxane-gay', 'Q16202911', 'roxanegay.bsky.social', 'did:plc:sp5paqzfmzlsxazgv7hrukda'),
  ('sasha-colby', 'Q115689986', 'thesashacolby.bsky.social', 'did:plc:nafp2y2mqcnhq7mozhbuusjy'),
  ('sharice-davids', 'Q58322868', 'davids.house.gov', 'did:plc:bhlcopurmgmt36fgqwor6yhx'),
  ('vivian-wilson', 'Q101674980', 'thevivllainous.bsky.social', 'did:plc:y6owim4fgnacr72xp2b2onvo')
)
update public.personalities p
   set social_links = coalesce(p.social_links, '{}'::jsonb)
                      || jsonb_build_object('bluesky', 'https://bsky.app/profile/' || v.handle),
       field_provenance = coalesce(p.field_provenance, '{}'::jsonb)
                      || jsonb_build_object('social_links.bluesky', jsonb_build_object(
                           'source', 'wikidata:P12361', 'qid', v.qid, 'did', v.did,
                           'verified_at', '2026-10-20'))
  from v
 where p.slug = v.slug
   and p.wikidata_qid = v.qid
   and p.duplicate_of_id is null
   and coalesce(p.social_links ->> 'bluesky', '') = '';

do $verify$
declare v_bad int;
begin
  -- No row may carry a Bluesky link whose handle is not the one Wikidata names.
  with v(slug, handle) as (values
    ('audrey-tang', 'audreyt.org'),
    ('becca-balint', 'balint.house.gov'),
    ('carla-antonelli', 'carlaantonelli.bsky.social'),
    ('carolin-emcke', 'emcke.bsky.social'),
    ('cassandra-peterson', 'therealelvira.bsky.social'),
    ('chase-strangio', 'chasestrangio.bsky.social'),
    ('chelsea-manning', 'xychelsea.tv'),
    ('chris-bryant', 'chrisbryant1962.bsky.social'),
    ('george-takei', 'georgetakei.bsky.social'),
    ('hormona-lisa', 'hormona-lisa.bsky.social'),
    ('luxx-noir-london', 'luxxofficial.bsky.social'),
    ('margaret-cho', 'margaretcho.bsky.social'),
    ('michelangelo-signorile', 'msignorile.bsky.social'),
    ('owen-jones', 'owenjones.bsky.social'),
    ('parker-molloy', 'parkermolloy.com'),
    ('roderic-o-gorman', 'rodericogorman.bsky.social'),
    ('roxane-gay', 'roxanegay.bsky.social'),
    ('sasha-colby', 'thesashacolby.bsky.social'),
    ('sharice-davids', 'davids.house.gov'),
    ('vivian-wilson', 'thevivllainous.bsky.social')
  )
  select count(*) into v_bad
  from public.personalities p join v on v.slug = p.slug
  where p.social_links ->> 'bluesky' is not null
    and p.social_links ->> 'bluesky' not ilike '%bsky.app/profile/%';
  if v_bad <> 0 then
    raise exception 'personality bluesky links: % malformed links', v_bad;
  end if;
end
$verify$;
