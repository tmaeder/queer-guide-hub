-- Point the Refugee Convention citation at the URL the document actually lives at.
--
-- Found by the link checker added alongside this migration, on its first real
-- run: `asylum-refugees` cited
--   treaties.un.org/pages/ViewDetails.aspx?…mtdsg_no=V-2&chapter=5…
-- which 302s to `ViewDetailsII.aspx`. The UN treaty collection serves chapter V
-- through the "II" view; the chapter IV citations in this set (CRC, CEDAW, CRPD,
-- ICCPR, ICESCR) do not redirect, which is why only this one moved.
--
-- Benign — the destination was fetched and is the Convention relating to the
-- Status of Refugees (adopted 28 July 1951, in force 22 April 1954, both present
-- on the page). This is not a correctness fix; it is a noise fix, and that
-- matters: a checker that prints the same warning every day is one people stop
-- reading, which is precisely how `mindlinetrans.org.uk` stayed published while
-- serving a gambling site.
--
-- Worth recording for whoever adds the next citation: the destination page
-- contains the string "PageNotFound" in its own navigation. A link checker that
-- scanned response BODIES for error markers would call this treaty dead. The one
-- added here compares the final URL PATH instead, which is why it does not.

select set_config('app.actor', 'admin:citation-url-canonicalise-20260909', true);

update public.tag_sources s
   set source_url = 'https://treaties.un.org/pages/ViewDetailsII.aspx?src=TREATY&mtdsg_no=V-2&chapter=5&Temp=mtdsg2&clang=_en',
       verified_at = now()
  from public.unified_tags t
 where t.id = s.tag_id
   and t.slug = 'asylum-refugees'
   and s.is_public
   and s.source_url = 'https://treaties.un.org/pages/ViewDetails.aspx?src=TREATY&mtdsg_no=V-2&chapter=5&clang=_en';

do $do$
declare v_url text; v_total int;
begin
  select s.source_url into v_url
    from public.tag_sources s join public.unified_tags t on t.id = s.tag_id
   where t.slug = 'asylum-refugees' and s.is_public;

  if v_url !~ 'ViewDetailsII' then
    raise exception 'asylum-refugees citation was not canonicalised: %', v_url;
  end if;

  -- Nothing else may have moved: this is a single-row rewrite.
  select count(*) into v_total from public.tag_sources where is_public;
  if v_total <> 18 then
    raise exception 'expected 18 public citations, found %', v_total;
  end if;
end $do$;
