-- RENUMBERED from 20261006190100, content otherwise unchanged.
--
-- `supabase db push` aborts on an unapplied migration that sorts BELOW the
-- newest version already applied to prod, and it aborts on the FIRST such file,
-- taking every later migration with it. This file and five siblings were in that
-- state, so from 2026-08-29 10:24Z every deploy-supabase-functions run failed and
-- NO migration reached prod — six merged PRs' worth, not just their own.
--
-- Deindex 304 tag pages whose prose is verbatim Kinktionary text.
--
-- MEASURED, NOT SUSPECTED
--
-- scripts/data-quality/measure-kinktionary-prose-overlap.mjs fetched each tag's
-- Kinktionary counterpart and recorded the longest run of IDENTICAL WORDS
-- between their page and ours:
--
--   730 rows  no overlap at all       -- genuinely our prose
--    24 rows  an 8-19 word run        -- short enough to be coincidence
--   304 rows  a run of 20+ words      -- not coincidence
--
--    66 of the 304 hit the measurement cap of 60 words, so their true run is
--    UNKNOWN and at least 60 consecutive identical words.
--
-- Every one of the 304 is seo_indexable.
--
-- THIS COVERS 71% OF THE CORPUS AND THE REST IS NOT MEASURED
--
-- 429 of the 1,487 tags with a counterpart came back UNREACHABLE, and they are
-- alphabetically contiguous from `protecting` to `zucchini`: FetLife began
-- answering 403 partway through the sweep (confirmed by hand afterwards — a
-- direct request for a known-good URL returns 403). So the measured range is
-- roughly `8-panel-sti-test` .. `prostate-milking`, and 304 IS A FLOOR, NOT A
-- TOTAL. At the 29% rate observed over the measured range, the unmeasured tail
-- likely holds ~120 more. Those pages stay indexed until a later run reaches
-- them; this migration deliberately does not guess at them.
--
-- WHY IT MATTERS
--
-- The Kinktionary licence (https://fetlife.com/kinktionary/license-zcfzz) is
-- non-commercial only and queer.guide is commercial; the NC term binds
-- adaptations as well as verbatim copies.
--
-- THE REVIVAL DID NOT WRITE THIS TEXT. Most of these rows were created
-- 2026-02-23, long before the Kinktionary was used as a signal here; some
-- earlier import copied it. What waves 1-5 did was take rows that were
-- deprecated and invisible and make them live and indexable, which turned a
-- dormant problem into a published one. That is why clearing it belongs to this
-- program.
--
-- WHY DEINDEX RATHER THAN DELETE THE PROSE
--
-- Deleting 304 bodies removes the exposure and also guts 304 glossary pages.
-- Some of the overlap may be OUR text that the Kinktionary took, or both
-- parties drawing on a common source: DIRECTION OF COPYING IS NOT SOMETHING A
-- WORD-RUN MEASUREMENT CAN ESTABLISH, and this migration does not pretend
-- otherwise. Deindexing is reversible, deletes nothing, and is better than the
-- status quo under either eventual answer — it stops the pages being crawled
-- and indexed while the rewrite-or-remove decision is made per page.
--
-- The prose is untouched. The page still renders for a reader who follows a
-- link; it is no longer offered to search engines.
--
-- run_tag_thin_page_reindex WILL NOT UNDO THIS. Its re-index half only restores
-- rows it deindexed for having no description, and it skips is_sensitive /
-- is_adult rows entirely — which most of these are. The two do not fight.
--
-- LICENCE, restated because kinktionaryLicence.test.ts requires every migration
-- in this program to carry it: NOT ONE WORD OF THEIR PROSE IS COPIED OR ADAPTED
-- by this program — only their term list and section headings were ever used,
-- as a signal for which of OUR rows to publish. This migration is the cleanup
-- of prose that a DIFFERENT, EARLIER import had already copied, and it removes
-- exposure rather than adding any.
--
-- The slug list is generated from out/kinktionary-prose-overlap.json, committed
-- alongside, so the selection is reproducible rather than asserted.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:kinktionary-verbatim-overlap-deindex', true);

do $mig$
declare
  r      record;
  v_bad  int;
  v_done int := 0;
begin
  create temp table _overlap (slug text primary key) on commit drop;
  insert into _overlap (slug) values
    ('8-panel-sti-test'),
    ('abrasion-play'),
    ('abseiling'),
    ('accomplice'),
    ('acrotomophillia'),
    ('adult-baby-diaper-lover-abdl'),
    ('aesthetic-fetishist'),
    ('agalmatophilia'),
    ('age-dreaming'),
    ('age-regressor'),
    ('ahegao'),
    ('alliteration'),
    ('alpha-slave'),
    ('alterous-attraction'),
    ('amatonormativity'),
    ('anal-angel'),
    ('anal-august'),
    ('anal-bate'),
    ('anal-master'),
    ('anal-only-d-s'),
    ('anal-princess'),
    ('anasyrma'),
    ('androx'),
    ('anguisette'),
    ('aphephilia'),
    ('aposexual'),
    ('ass-job'),
    ('ass-master'),
    ('asswhore'),
    ('attunement-play'),
    ('autofellatio'),
    ('bacchanalia'),
    ('backshot'),
    ('bacterial-vaginosis'),
    ('ball-kicking'),
    ('ball-stretching'),
    ('basorexic'),
    ('bdsm-oriented'),
    ('belly-play'),
    ('bellyriding'),
    ('berrisexual'),
    ('bi-friendly'),
    ('bi-situational'),
    ('bird'),
    ('biter'),
    ('book-daddy'),
    ('boot-blacking'),
    ('boot-kink'),
    ('boot-licking'),
    ('boot-worship'),
    ('boston-marriage'),
    ('bottom-bitch'),
    ('boyflux'),
    ('brat-king'),
    ('brat-queen'),
    ('bratty-bottom'),
    ('bratty-dom-bratty-domme'),
    ('bratty-princess'),
    ('bratty-sub'),
    ('bratty-top'),
    ('breeder'),
    ('bunfuck'),
    ('bussy'),
    ('cake-and-cunnilingus-day'),
    ('cake-sitting'),
    ('capitalization-in-kink'),
    ('captain'),
    ('cardiophilia'),
    ('cassexual'),
    ('catfish'),
    ('cenobite'),
    ('cervical-orgasm'),
    ('chaos-top'),
    ('cheirophilia'),
    ('circumsexual'),
    ('clit-and-pussy-torture-cpt'),
    ('clit-pumping'),
    ('cock-milking'),
    ('cock-slut'),
    ('cock-socket'),
    ('compersion'),
    ('consensual-non-consent-cnc'),
    ('core-bdsm'),
    ('cosbied'),
    ('coterie'),
    ('crossdresser-transvestite'),
    ('crucifixion-fetish'),
    ('crumbs'),
    ('crurophilia'),
    ('cuckette'),
    ('cuddle-top'),
    ('cum-eating'),
    ('cum-factory'),
    ('cum-on-command-coc'),
    ('cum-princess'),
    ('cumdrunk'),
    ('cunnilingus-slave'),
    ('cyborg'),
    ('dark-age-play'),
    ('defilement'),
    ('demdom'),
    ('demian'),
    ('demon-mommy'),
    ('destroy-dick-december'),
    ('devil'),
    ('devourer'),
    ('diaperfur'),
    ('dilf'),
    ('dining-at-the-y-daty'),
    ('doctor'),
    ('dom-me-tamer'),
    ('domestic-discipline-dd'),
    ('dominance-and-submission-d-s'),
    ('dominant-little'),
    ('dominant-sadist'),
    ('domspace'),
    ('doraphilia'),
    ('double-blowjob'),
    ('double-glazing'),
    ('duminant'),
    ('dungeon-master-dm'),
    ('ecosexual'),
    ('emotional-support-human-esh'),
    ('empath'),
    ('eudaimonist'),
    ('event-safety'),
    ('exit-strategy'),
    ('eye-fucking'),
    ('face-farting'),
    ('fallen-angel'),
    ('faunetflux'),
    ('febfem'),
    ('felching'),
    ('fembot'),
    ('feral-muse'),
    ('fetish'),
    ('fetish-party'),
    ('fictoromantic'),
    ('fictosexual'),
    ('fidget-toy'),
    ('findom-me'),
    ('fingering'),
    ('flirtationship'),
    ('florasexual'),
    ('fluffing'),
    ('foot-play'),
    ('foot-worship'),
    ('formicophilia'),
    ('forniphilia'),
    ('free-spirit'),
    ('fuckit-list'),
    ('futanari'),
    ('futch'),
    ('fweeb'),
    ('gags'),
    ('gainer'),
    ('gangbang-party'),
    ('gender-nullification'),
    ('gerontophilia'),
    ('girl-next-door'),
    ('girlboss'),
    ('girlflux'),
    ('glove-fetish'),
    ('gokkun'),
    ('golden-retriever'),
    ('gooning'),
    ('graygender'),
    ('grounding'),
    ('group-masturbation'),
    ('group-sex'),
    ('guard-dog'),
    ('guinea-pig'),
    ('guru'),
    ('gynx'),
    ('hairjob'),
    ('hand-feeding'),
    ('hard-dom-me'),
    ('hard-masochist'),
    ('harlot'),
    ('hellkitten'),
    ('hentai'),
    ('hermit'),
    ('hierophilia'),
    ('high-protocol'),
    ('hinge-partner'),
    ('hobosexual'),
    ('hole-dozer'),
    ('homiesexual'),
    ('honorifics'),
    ('horny-net-geek-hng'),
    ('hot-aunty'),
    ('housewife'),
    ('human-ashtray'),
    ('human-fleshlight'),
    ('humiliatrix'),
    ('hunter'),
    ('huntress'),
    ('hussy'),
    ('impact-partner'),
    ('inflatee'),
    ('inflation-kink'),
    ('inflator'),
    ('inner-thigh-spanking'),
    ('international-fisting-day'),
    ('intimate-partner-abuse'),
    ('it-s-complicated'),
    ('jester'),
    ('kink'),
    ('kink-dispenser'),
    ('kinktober'),
    ('kinky-fuckery'),
    ('kinkycule'),
    ('kitsune'),
    ('lap-pet'),
    ('latex-princess'),
    ('leather-fetish'),
    ('leather-gloves-fetish'),
    ('leather-lover'),
    ('leather-pet'),
    ('level-party'),
    ('lifestyle-kink'),
    ('lingam-massage'),
    ('little-bear'),
    ('locktober'),
    ('lone-wolf'),
    ('lovedrug'),
    ('lover-girl'),
    ('luna'),
    ('lycampire'),
    ('lycan'),
    ('mademoiselle'),
    ('malewife'),
    ('mama-bear'),
    ('mancunt'),
    ('mare-cunt'),
    ('masculinization'),
    ('masturbation-party'),
    ('meat'),
    ('meat-puppet'),
    ('menorrhagia-heavy-periods'),
    ('merosexual'),
    ('mommy-dom-me'),
    ('monsieur'),
    ('morosexual'),
    ('mullerian'),
    ('multitool'),
    ('muscle-mommy'),
    ('mushroom-stamp'),
    ('mx'),
    ('mysophilia'),
    ('nala'),
    ('nantaimori'),
    ('netorare-ntr'),
    ('neurodivergence'),
    ('ninromantic'),
    ('ninsexual'),
    ('nipple-torture'),
    ('nipplegasm'),
    ('no-nut-november'),
    ('odaxelagnia'),
    ('olfactophilia'),
    ('outdoor-sex'),
    ('padded'),
    ('pain-bringer'),
    ('pain-princess'),
    ('panther'),
    ('panther-girl'),
    ('paraboy'),
    ('partialism'),
    ('patient'),
    ('patron-saint'),
    ('pay-for-play'),
    ('peer-rope'),
    ('pelvic-organ-prolapse'),
    ('percussion-play'),
    ('personal-responsibility-informed-consensual-kink-prick'),
    ('pervertables'),
    ('pet-owner'),
    ('phallophilia'),
    ('pharaoh'),
    ('philosopher'),
    ('pillow-prince'),
    ('plapgasm'),
    ('platonic-crush'),
    ('play-party'),
    ('play-room'),
    ('play-styles'),
    ('playtoy'),
    ('pleasure-masochist'),
    ('pleasure-slave'),
    ('pleasure-switch'),
    ('plushie'),
    ('polyplatonic'),
    ('polysaturation'),
    ('pomosexual'),
    ('pony-play'),
    ('poop-desperation'),
    ('post-nut-clarity'),
    ('praise-kink'),
    ('primal-play'),
    ('primal-prey'),
    ('primal-princess'),
    ('proclivities-sexual'),
    ('prostate-milking');

  for r in select o.slug, t.id from _overlap o
             join public.unified_tags t on t.slug = o.slug
            where t.seo_indexable loop
    update public.unified_tags
       set seo_indexable = false, updated_at = now()
     where id = r.id;
    v_done := v_done + 1;
  end loop;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _overlap o
    join public.unified_tags t on t.slug = o.slug
   where t.seo_indexable;
  if v_bad > 0 then
    raise exception 'verbatim-overlap deindex: % row(s) are still indexable', v_bad;
  end if;

  -- Visibility only. If a description went missing here, something else ran.
  select count(*) into v_bad from _overlap o
    join public.unified_tags t on t.slug = o.slug
   where coalesce(nullif(btrim(t.description), ''), t.short_description) is null;
  if v_bad > 0 then
    raise exception 'verbatim-overlap deindex: % row(s) lost their description', v_bad;
  end if;

  raise notice 'verbatim-overlap deindex: % of % listed rows deindexed',
    v_done, (select count(*) from _overlap);
end
$mig$;
