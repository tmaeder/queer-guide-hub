-- resolve_spot ran as SECURITY DEFINER, so an anonymous caller learned whether
-- a safety-gated venue or organization exists under a slug (venues in
-- criminalizing countries). As INVOKER the existing RLS answers per caller:
-- anon sees the ungated subset, a signed-in user sees everything. Both slug
-- redirect tables are public-read, so redirects keep resolving.
alter function public.resolve_spot(text) security invoker;

do $verify$
begin
  if (select prosecdef from pg_proc where oid = 'public.resolve_spot(text)'::regprocedure) then
    raise exception 'resolve_spot is still SECURITY DEFINER';
  end if;
  if public.resolve_spot('__no_such_spot__') is not null then
    raise exception 'resolve_spot answers for a slug that does not exist';
  end if;
end
$verify$;
