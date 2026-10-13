-- Social accounts stay separate from person attribution.
create or replace function public.news_person_author(p_raw text, p_source_name text default null, p_publisher_name text default null)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := btrim(public.news_decode_entities(p_raw)); v_json jsonb;
begin
  if left(v,1) = '[' then
    begin
      v_json := v::jsonb;
      if jsonb_typeof(v_json)='array' then
        select string_agg(public.news_person_author(elem #>> '{}',p_source_name,p_publisher_name), ', ' order by ord)
        into v from jsonb_array_elements(v_json) with ordinality as j(elem,ord)
        where jsonb_typeof(elem)='string';
        return v;
      end if;
    exception when invalid_text_representation then null;
    end;
  end if;
  if v is null or v like '@%' or v ~* '^https?://' or v ~* '^/(u|r)/' then return null; end if;
  v := regexp_replace(v, '[[:space:]]+@[[:space:]]+.*$', '');
  v := regexp_replace(v, '^(Queer Theology|Sony Music Entertainment)[[:space:]]*/[[:space:]]*', '', 'i');
  v := regexp_replace(v, '[[:space:]]*(& Studio71|/ TableCakes Productions|/ Beyond Sunset|\| Gay Men’s Brotherhood|• Life Architect)$', '', 'i');
  v := regexp_replace(v, '( - The Buckeye Flame|, the 19th)$', '', 'i');
  v := btrim(regexp_replace(regexp_replace(v, 'https?://[^[:space:]]+', '', 'gi'), '^((published|written)[[:space:]]+)?by[[:space:]]*:?[[:space:]]*', '', 'i'));
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  if length(v) < 2 or length(v)>255 or v ~ '^[0-9]+$' or v ~ '[;[:cntrl:]]' or v ~* '^/[a-z0-9_-]+$'
     or v ~* '^(editors?|editorial( team| staff| board)?|staff( writers?| reporters?)?|staff writer|newsroom|news team|redaktion|redaktions(team)?|admin|administrator|the editors|the editorial team|unknown|none|null|undefined|anonymous)$'
     or v ~* '(\m(editors?|staff|reporter)\M|^redazione\M)'
     or v ~* '\m(podcasts?|pod|network|productions|publishing|news agency|media|radio|studio[0-9]+|collective|church|council|presents)\M'
     or v ~* '^[a-z0-9.-]+\.(com|org|net|co\.uk)$'
     or v ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+'
     or lower(v) in ('pn freelancer','lesbian chronicles','sodomarama','your queer story','transadvocate','homestead on the corner | realm','legal - lgbt bar of new york','q 播客製作委員會','podbean development','foxnews','new york post','huffpost','press room','associated press','the associated press','reuters','mim','well established lesbian')
     or regexp_replace(lower(v), '[^[:alnum:]]', '', 'g') = regexp_replace(lower(p_source_name), '[^[:alnum:]]', '', 'g')
     or regexp_replace(lower(v), '[^[:alnum:]]', '', 'g') = regexp_replace(lower(p_publisher_name), '[^[:alnum:]]', '', 'g') then return null;
  end if;
  return nullif(v, '');
end;
$$;

update public.news_articles set author=author where author like '%@%';

