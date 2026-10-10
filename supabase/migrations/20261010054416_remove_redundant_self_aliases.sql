-- Remove 41 self-aliases created by the English-label passes and left behind
-- when collision labels were restored. Each alias name AND slug matches its
-- own canonical tag: it adds no vocabulary or redirect. Search synonyms linked
-- to these aliases repeat the canonical lookup and must be removed together.
-- No tag, content assignment, or alternative translation is changed.
-- The complete before-image (aliases and synonyms) is preserved in
-- docs/audits/2026-10-10-self-alias-backup.json for audit or restoration.

do $repair$
begin
  perform set_config('app.actor', 'migration:remove_redundant_self_aliases', true);
  create temp table _self_alias_ids on commit drop as
    select a.id from public.tag_aliases a
    join public.unified_tags t on t.id=a.canonical_tag_id
    where lower(a.alias_name)=lower(t.name) and a.alias_slug=t.slug
      and a.alias_type='multilingual'
      and a.created_at >= '2026-10-10 04:53:00+00'::timestamptz
      and a.created_at < '2026-10-10 05:26:00+00'::timestamptz
      and a.alias_slug in (
      'komiker',
      'identitat',
      'tanzer',
      'dichter',
      'dirigent',
      'dragperformer',
      'arzt-arztin',
      'anonym',
      'gleichstellung',
      'queere-kultur',
      'gruppe',
      'musiker',
      'modedesigner',
      'sexarbeiter',
      'autor',
      'redakteur',
      'queer-kultur',
      'polizei',
      'vorurteile',
      'sangerin',
      'gonorrhea-tripper',
      'entfesselungskunstler',
      'kriegerin',
      'billard',
      'schauspieler',
      'schauspieler-in',
      'regisseur',
      'schriftstellerin',
      'fotograf',
      'performancekuenstler',
      'priester',
      'verleger',
      'begine',
      'preise',
      'dragkuenstler',
      'literatur',
      'auszeichnungen',
      'pommes',
      'vernetzung',
      'komponist',
      'nonne');
  delete from public.search_synonyms s using _self_alias_ids d
    where s.tag_alias_id=d.id;
  delete from public.tag_aliases a using _self_alias_ids d where a.id=d.id;
  if exists (select 1 from public.tag_aliases a
      join public.unified_tags t on t.id=a.canonical_tag_id
      where lower(a.alias_name)=lower(t.name)) then
    raise exception 'Self-alias regression remains; repair rolled back';
  end if;
end
$repair$;
