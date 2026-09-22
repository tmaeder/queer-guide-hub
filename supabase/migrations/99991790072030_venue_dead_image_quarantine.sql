-- Quarantine venue image assets whose source returned a deterministic 404 on
-- every bounded metadata attempt. Keeping the asset/link preserves audit
-- history while removing a dead image from public media selection.

update public.image_assets ia
set status = 'flagged',
    is_flagged = true,
    flagged_reason = 'source_http_404_after_3_attempts'
where ia.status = 'active'
  and ia.optimization_status = 'failed'
  and ia.metadata->>'last_failure_reason' = 'http_404'
  and coalesce((ia.metadata->>'venue_metadata_attempts')::integer, 0) >= 3
  and exists (
    select 1
    from public.image_asset_links l
    where l.asset_id = ia.id and l.entity_type = 'venue'
  );

do $assert$
begin
  if exists (
    select 1
    from public.image_assets ia
    where ia.status = 'active'
      and ia.metadata->>'last_failure_reason' = 'http_404'
      and coalesce((ia.metadata->>'venue_metadata_attempts')::integer, 0) >= 3
      and exists (
        select 1 from public.image_asset_links l
        where l.asset_id = ia.id and l.entity_type = 'venue'
      )
  ) then
    raise exception 'terminal 404 venue image remained active';
  end if;
end;
$assert$;
