#!/usr/bin/env node
// Retain raw provider evidence, but stop unsupported discoveries entering review.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { hasFoursquareDiscoveryEvidence } from '../../supabase/functions/_shared/foursquare-discovery-filter.ts'
const args=process.argv.slice(2)
const option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
const apply=args.includes('--apply'),rollback=args.includes('--rollback')
if(apply&&rollback)throw Error('Choose apply or rollback')
const limit=Number(option('--limit','100'))
if((apply||rollback)&&limit>100)throw Error('Write and rollback transactions are bounded to 100 records; preview supports 2000')
if(!Number.isInteger(limit)||limit<1||limit>2000)throw Error('Bounded limit 1–2000 required')
const output=option('--output',`outputs/foursquare-unsupported-${Date.now()}.json`)
try{await readFile(output);throw Error('A fresh journal path is required')}catch(e){if(e.code!=='ENOENT')throw e}
let token=process.env.SUPABASE_PAT
if(!token){const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw}
async function sql(query){const r=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(90000)});if(!r.ok){const detail=(await r.text()).slice(0,700);throw Error(`Native HTTP ${r.status}; reconcile before retry: ${detail}`)};return r.json()}
const scope=`s.source_type='foursquare' and s.source_name='foursquare' and s.target_table='venues' and s.entity_type='venue'
 and s.disposition='pending' and s.review_status='pending_review' and s.reviewed_by is null and s.reviewed_at is null
 and s.target_record_id is null and s.raw_data->>'_requires_editorial_review'='true'
 and s.review_notes='Foursquare-only discovery requires independent editorial corroboration'
 and s.normalized_data#>'{metadata,discovery_evidence}'='[]'::jsonb
 and not exists(select 1 from public.venues v where v.foursquare_id=s.source_entity_id)
 and not exists(select 1 from public.venue_sources v where v.source_entity_id=s.source_entity_id and v.source_slug in('foursquare','foursquare_os'))
 and not exists(select 1 from public.review_queue q where q.entity_id=s.id and (q.resolved_by is not null or q.resolved_at is not null or q.status<>'pending' or q.review_type<>'foursquare_independent_corroboration'))`
const candidates=await sql(`select s.id,md5(to_jsonb(s)::text) snapshot_hash,to_jsonb(s) snapshot from public.ingestion_staging s where ${scope} order by s.id limit ${limit}`)
const eligible=candidates.filter(r=>!hasFoursquareDiscoveryEvidence(r.snapshot.raw_data))
const report={started_at:new Date().toISOString(),apply,rollback,limit,candidates:candidates.length,retained_explicit:candidates.length-eligible.length,eligible,receipts:[],complete:false}
await mkdir(dirname(output),{recursive:true})
const save=async()=>{await writeFile(output+'.tmp',JSON.stringify(report,null,2));await rename(output+'.tmp',output)}
await save()
if(apply||rollback){
 const literal=JSON.stringify(eligible.map(({id,snapshot_hash})=>({id,snapshot_hash}))).replace(/'/g,"''")
 const query=`begin;set local lock_timeout='3s';set local statement_timeout='60s';
 do $repair$ declare item jsonb;r public.ingestion_staging%rowtype;changed integer:=0;begin
 for item in select value from jsonb_array_elements('${literal}'::jsonb) loop
  select s.* into r from public.ingestion_staging s where s.id=(item->>'id')::uuid and ${scope} and md5(to_jsonb(s)::text)=item->>'snapshot_hash' for update skip locked;
  if not found then continue;end if;
  perform 1 from public.review_queue q where q.entity_id=r.id for update;
  if exists(select 1 from public.review_queue q where q.entity_id=r.id and (q.resolved_by is not null or q.resolved_at is not null or q.status<>'pending' or q.review_type<>'foursquare_independent_corroboration')) then continue;end if;
  update public.ingestion_staging set disposition='rejected',error_message='automatic_discovery_missing_explicit_relevance_v1',processed_at=now(),updated_at=now() where id=r.id;
  if exists(select 1 from public.ingestion_staging s where s.id=r.id and (to_jsonb(s)-array['disposition','error_message','processed_at','updated_at'])<>(to_jsonb(r)-array['disposition','error_message','processed_at','updated_at'])) then raise exception 'Unrelated staging fields changed';end if;
  update public.review_queue set status='rejected',resolved_at=now(),details=coalesce(details,'{}'::jsonb)||jsonb_build_object('automatic_outcome','discovery_missing_explicit_relevance_v1','human_reviewed',false,'raw_evidence_retained',true)
   where entity_id=r.id and status='pending' and resolved_by is null and resolved_at is null and review_type='foursquare_independent_corroboration';
  changed:=changed+1;
 end loop;
 perform set_config('matching.foursquare_discovery_changed',changed::text,true);
 end $repair$;
 select current_setting('matching.foursquare_discovery_changed')::integer changed;
 ${rollback?'rollback':'commit'};`
 const receipt={status:'submitting',ids:eligible.map(r=>r.id)};report.receipts.push(receipt);await save()
 try{receipt.result=await sql(query);receipt.status='completed';await save()}catch(e){receipt.status='outcome_unknown';await save();throw e}
}
report.complete=true;report.finished_at=new Date().toISOString();await save()
console.log(JSON.stringify({output,eligible:eligible.length,retained_explicit:report.retained_explicit,result:report.receipts.map(r=>r.result),apply,rollback}))
