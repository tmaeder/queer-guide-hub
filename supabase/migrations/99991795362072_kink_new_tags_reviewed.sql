-- Mark the four tags created by 99991795359027_kink_filter_terms as reviewed.
--
-- They were created with verification_status = 'unverified', and because they
-- are is_sensitive, tag_is_anon_gated() hid their glossary rows from signed-out
-- readers: /tags/underwear-party etc. fell back to the reduced KinkTermPage
-- while every other kink filter term showed its full page. The owner reviewed
-- the four entries and asked for them to be published like the rest.
--
-- seo_indexable stays false (unchanged), as for every other sensitive term.

select set_config('app.actor', 'migration:99991795362072_kink_new_tags_reviewed', true);

update public.unified_tags
   set verification_status = 'reviewed'
 where slug in ('naked-party', 'underwear-party', 'sneakers', 'private-cabins')
   and verification_status is distinct from 'reviewed';

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('naked-party', 'underwear-party', 'sneakers', 'private-cabins')
     and (verification_status <> 'reviewed'
          or public.tag_is_anon_gated(is_sensitive, verification_status));
  if v_bad <> 0 then
    raise exception 'P1 failed: % of the four tags are still hidden from anon', v_bad;
  end if;
  if (select count(*) from public.unified_tags
       where slug in ('naked-party', 'underwear-party', 'sneakers', 'private-cabins')) <> 4 then
    raise exception 'P2 failed: expected all four tags to exist';
  end if;
end
$verify$;
