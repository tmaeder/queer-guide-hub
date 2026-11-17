-- Non-Latin headlines must not generate a leading-hyphen slug.
-- Keep valid supplied slugs and existing ASCII title slugs; use a neutral,
-- deterministic fallback when no ASCII stem exists. Publication gates are unchanged.
do $migration$
declare definition text; previous text:=$old$coalesce(nullif(v_norm->>'slug',''),
            trim(both '-' from substr(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 1, 240))
              || '-' || substr(coalesce(v_fp, gen_random_uuid()::TEXT), 1, 8))$old$;
replacement text:=$new$coalesce(
            case when (v_norm->>'slug') ~ '^([a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$'
              then v_norm->>'slug' end,
            coalesce(nullif(trim(both '-' from substr(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), 1, 240)),''),'article')
              || '-' || substr(coalesce(v_fp, v_row.id::text), 1, 8))$new$;
begin
 select pg_get_functiondef('public.news_commit_staging_batch(uuid,uuid,integer)'::regprocedure) into definition;
 if position(replacement in definition)>0 then return;end if;
 if position(previous in definition)=0 then raise exception 'Unexpected news slug expression; inspect before replacing';end if;
 execute replace(definition,previous,replacement);
end $migration$;
