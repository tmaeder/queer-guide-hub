-- Actual production helper snapshot, 2026-10-30; no fixture facts or credentials.
CREATE OR REPLACE FUNCTION api_private.review_news_machine_outcome(e jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare d jsonb:=e->'quality_decision';
begin
 if jsonb_typeof(d)<>'object' or jsonb_typeof(d->'confidence')<>'number'
  or jsonb_typeof(d->'relevanceScore')<>'number' or jsonb_typeof(d->'qualityScoreAfter')<>'number'
  or d->>'needsManualReview' is distinct from 'false' then return null; end if;
 if (d->>'confidence')::numeric<0.7 then return null; end if;
 if e->>'quality_status'='passed' and e->>'auto_publish'='true'
  and e->'auto_publish_blocked_reasons'='[]'::jsonb and d->>'isRelevant'='true'
  and (d->>'relevanceScore')::numeric>=0.75 and (d->>'qualityScoreAfter')::numeric>=0.7
  and d->>'isSatire'='false' and d->>'isAdvertorial'='false' then return 'publish'; end if;
 if e->>'quality_status'='rejected' and length(btrim(coalesce(d->>'title','')||coalesce(d->>'cleanedBody','')))>0
  and ((d->>'isRelevant'='false' and (d->>'relevanceScore')::numeric<0.3)
   or (e->'auto_publish_blocked_reasons' ? 'critical_paywall' and (d->>'qualityScoreAfter')::numeric<0.5))
 then return 'reject'; end if;
 return null;
end $function$;
