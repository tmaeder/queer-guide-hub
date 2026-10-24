-- Strip RSS CDATA-terminator residue ("]]" / "]]>") from news bodies and excerpts.
--
-- Producer: source-rss-news/rss-parse.ts extractTag() only unwrapped a CDATA
-- section that filled its element EXACTLY. Any whitespace between the tag and
-- the section, or a second section, fell through to the raw branch; cleanText
-- then stripped `<![CDATA[...>` as if it were a tag and left the terminator.
-- Fixed in the same PR (every section is now unwrapped).
--
-- Measured 2026-10-24: 2,682 rows.
--   * 21 Pride Source articles: content AND excerpt start with "]]"
--     (whitespace + two CDATA sections in <description>), all also end in "]]".
--   * 2,647 rows (overwhelmingly podcast episodes: megaphone / art19 /
--     podcastchoices feeds) whose content ends in " ]]"; 490 excerpts too.
--   Every trailing "]]" read was the terminator (19 lack the leading space and
--   all 19 also carry a literal "![CDATA[" — mangled further, see below).
--
-- NOT repaired here, named instead: 19 rows (Just Break Up / Getting Curious)
-- carry a literal "![CDATA[p..." with every angle bracket already stripped.
-- That is a different, lossy mangling a trim cannot reverse; the parser fix
-- stops new ones. Also: where cleanText ate `<![CDATA[` up to the first `>`
-- inside the text, the start of that body is LOST and not recoverable here.
--
-- Content-guarded (the WHERE is the defect itself), idempotent, and only ever
-- REMOVES the artifact. pipeline-resanitize-news re-cleans stored content, not
-- raw XML, so it cannot re-introduce it.

update public.news_articles
set content = regexp_replace(regexp_replace(content, '^\s*\]\]>?\s*', ''), '\s*\]\]>?\s*$', ''),
    excerpt = case when excerpt is null then null
                   else regexp_replace(regexp_replace(excerpt, '^\s*\]\]>?\s*', ''), '\s*\]\]>?\s*$', '') end
where content ~ '^\s*\]\]' or content ~ '\]\]>?\s*$'
   or excerpt ~ '^\s*\]\]' or excerpt ~ '\]\]>?\s*$';

do $verify$
declare v_bad int; v_total int;
begin
  select count(*) into v_total from public.news_articles;
  if v_total = 0 then
    raise exception 'postcondition: news_articles is empty, check is vacuous';
  end if;

  select count(*) into v_bad from public.news_articles
  where content ~ '^\s*\]\]' or content ~ '\]\]>?\s*$'
     or excerpt ~ '^\s*\]\]' or excerpt ~ '\]\]>?\s*$';
  if v_bad <> 0 then
    raise exception 'postcondition failed: % news_articles still carry CDATA terminator residue', v_bad;
  end if;
end
$verify$;
