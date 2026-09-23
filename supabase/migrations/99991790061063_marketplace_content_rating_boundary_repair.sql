-- Restore the word-boundary and slug-tier guarantees after the recovered
-- marketplace_quality_completion migration replaced this function in production.

create or replace function public.marketplace_content_rating(
  p_subcategory text,
  p_title text,
  p_description text
)
returns text
language sql
immutable
set search_path = public, extensions
as $function$
  with s as (
    select
      lower(regexp_replace(coalesce(p_subcategory, ''), '[\s\-]+', '_', 'g')) as slug,
      lower(coalesce(p_title, '') || ' ' || coalesce(p_description, '')) as txt
  ), ranked as (
    select greatest(
      case
        WHEN slug IN (
          'sex_toys', 'anal_toys', 'cock_rings', 'cock_rings_and_stretchers',
          'dildos', 'vibrators', 'masturbators', 'pumps_and_enlargement',
          'chastity', 'cage', 'bdsm_and_bondage', 'bondage', 'bdsm',
          'butt_plugs', 'penis_rings', 'penis_pumps', 'pup_and_pet_play'
        ) THEN 4
        WHEN slug IN (
          'fetish_wear', 'fetish_gear', 'lubricants', 'condoms',
          'adult_magazines', 'adult_digital_magazines', 'adult_photo_books',
          'adult_art_prints', 'adult_zines', 'adult_photography',
          'adult_polaroids', 'adult_subscriptions'
        ) THEN 3
        WHEN slug IN ('underwear_and_swimwear', 'underwear', 'swimwear') THEN 2
        ELSE 1
      end,
      case
        WHEN txt ~ '(dildo|butt ?plug|silicone plug|vibrat|cock ?ring|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|\mstrap[- ]?ons?\M|anal (plug|bead|douche|hook|fastener|speculum)|nipple clamp|urethral|\me[- ]?stim\M|\mestim\M|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange|flogger|elastrator|\mwhips?\M|spreader ?bar|\mball ?gag|\mgimp\M|humbler|hogtie|\mcock\M|penis[- ]?extender|penisvergr|klitoris|clitoris|clitoral|stimulator|love ?egg|liebesei|sexspielzeug|lovetoys?|\mg[- ]?spot|\mg[- ]?punkt)'
          THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|\menema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik|\manal\M|(silicone|wooden|leather|boot|spanking) paddle|nose hook)'
          THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche|orgasm)'
          THEN 2
        ELSE 1
      end
    ) as rank
    from s
  )
  select case rank
    when 4 then 'explicit'
    when 3 then 'adult'
    when 2 then 'suggestive'
    else 'sfw'
  end
  from ranked;
$function$;

-- The rating is a stored generated column. Naming a base column in the SET
-- list makes PostgreSQL recompute it without a full table rewrite.
update public.marketplace_listings m
set title = m.title
where m.content_rating is distinct from
  public.marketplace_content_rating(m.subcategory, m.title, m.description);

delete from public.search_documents sd
using public.marketplace_listings ml
where sd.entity_type = 'marketplace'
  and sd.entity_id = ml.id
  and ml.content_rating not in ('sfw', 'suggestive');

insert into public.search_reindex_queue(entity_type, entity_id)
select 'marketplace', ml.id
from public.marketplace_listings ml
where ml.status = 'active'
  and ml.content_rating in ('sfw', 'suggestive')
on conflict do nothing;
