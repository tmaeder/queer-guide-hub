-- get_organization: return each venue's phone in the nested `venues` list.
--
-- The organisation page reads `organizations.phone`, which is empty on 2,207
-- organisations whose venue carries a number (measured 2026-10-20; e.g.
-- /organizations/pluto-sauna has none while /venues/pluto-sauna has
-- +492012488403). Most organisations are the identity minted above one venue,
-- before the venue's number arrived. The page now falls back to the primary
-- venue's phone (listed first), so the RPC has to carry it.
--
-- No data is copied into `organizations`, and the venue list keeps its own
-- safety gate unchanged, so a gated venue's phone is never exposed.
--
-- Patched from the LIVE definition rather than restated, so whatever has been
-- applied to the body since its last migration survives. Idempotent: a body
-- that already returns the phone is left alone.

do $patch$
declare
  v_src  text := pg_get_functiondef('public.get_organization(text)'::regprocedure);
  v_from text := '''name'', v.name, ''city'', v.city,';
  v_to   text := '''name'', v.name, ''city'', v.city, ''phone'', v.phone,';
begin
  if position('''phone'', v.phone' in v_src) > 0 then
    raise notice 'get_organization already returns venue phone; nothing to do';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'get_organization: expected exactly one venue-object anchor';
  end if;
  execute replace(v_src, v_from, v_to);
end
$patch$;

do $verify$
declare
  v_src text := pg_get_functiondef('public.get_organization(text)'::regprocedure);
begin
  if position('''phone'', v.phone' in v_src) = 0 then
    raise exception 'get_organization does not return venue phone';
  end if;
  if position('v.safety_gated is not true' in v_src) = 0 then
    raise exception 'get_organization lost the venue safety gate';
  end if;
  perform public.get_organization('__no_such_org__');
end
$verify$;
