import postgres from 'npm:postgres@3.4.7'
import { COHORT } from './cohort.ts'
import { cleanTitle, description, POLICY, type Candidate, type Page } from './policy.ts'
export const NAME='outxout-official-date-review', SLUG='outxout_official_dates_weekly', CONTINUE='outxout_official_dates_continue'
export type Db=ReturnType<typeof postgres>
type Tx=postgres.TransactionSql
// Private durable JSON ledgers; source text is never executable SQL.
export type RecordData=Record<string,postgres.JSONValue|undefined>
/** Validate external response objects at the durable JSON boundary. */
export function jsonValue(value:unknown):postgres.JSONValue { return JSON.parse(JSON.stringify(value)) as postgres.JSONValue }
interface Ledger extends RecordData {
  results: Record<string,RecordData>
  source_cache: RecordData
  attempts: Record<string,number>
  ledger_id: string|number
  lease_token?: string
  lease_until?: string
  retry_at?: string
  dry_run?: boolean
}
interface RunRecord { id:string; context?:RecordData & {review_ledger_id?:string|number} }
interface EventRecord extends RecordData {
  title:string
  description:string|null
  start_date:string|null
  end_date:string|null
  review_status:string
  city_id:string
  enrichment_status:RecordData & {date_confirmation?:RecordData & {state?:string}}
  field_provenance?:Record<string,RecordData & {source:string}>
}
export function connect():Db { return postgres(Deno.env.get('SUPABASE_DB_URL')!,{max:1,prepare:false,idle_timeout:5,connect_timeout:10,connection:{application_name:'outxout-official-dates',statement_timeout:15000}}) }
export async function snapshot(db:Db,id:string){const [r]=await db`select to_jsonb(e) event,md5(to_jsonb(e)::text) fingerprint from public.events e where id=${id}::uuid`;return r as {event:EventRecord;fingerprint:string}|undefined}
async function ledger(tx:Tx,run:RunRecord):Promise<Ledger> {
  if(run.context?.review_ledger_id){
    const [r]=await tx`select id,summary from public.admin_automation_runs where id=${run.context.review_ledger_id}::bigint and automation_slug=${SLUG} for update`
    if(!r||r.summary.pipeline_run_id!==run.id)throw Error('private_review_ledger_missing')
    return {results:{},source_cache:{},attempts:{},...r.summary,ledger_id:r.id}
  }
  const [r]=await tx`insert into public.admin_automation_runs(automation_id,automation_slug,status,summary)
    select id,${SLUG},'running',${tx.json({...run.context,pipeline_run_id:run.id})} from public.admin_automations where slug=${SLUG} returning id`
  if(!r)throw Error('private_review_ledger_creation_failed')
  return {results:{},source_cache:{},attempts:{},...run.context,pipeline_run_id:run.id,ledger_id:r.id}
}
async function persist(tx:Tx,id:string,ctx:Ledger){
  const results=Object.values(ctx.results??{}) as RecordData[]
  await tx`update public.admin_automation_runs set summary=${tx.json(ctx)},items_examined=${results.length},items_changed=${results.filter(r=>r.state==='approved'||r.state==='date_confirmed_pending_other_review').length} where id=${ctx.ledger_id}::bigint and automation_slug=${SLUG}`
  const publicContext={policy:POLICY,dry_run:ctx.dry_run===true,review_ledger_id:ctx.ledger_id,examined:results.length,approved:results.filter(r=>r.state==='approved').length,errors:results.filter(r=>r.state==='error').length}
  await tx`update public.pipeline_runs set context=${tx.json(publicContext)},updated_at=now() where id=${id}::uuid`
}
export async function claim(db:Db,mode:string){return await db.begin(tx=>claimWithin(tx,mode))}
export async function claimWithin(tx:Tx,mode:string){
  await tx`select pg_advisory_xact_lock(hashtextextended(${NAME},0))`
  const [enabled]=await tx`select enabled from public.admin_automations where slug=${SLUG}`
  if(!enabled?.enabled)return {idle:true,reason:'disabled'}
  let [run]=await tx<RunRecord[]>`select * from public.pipeline_runs where pipeline_name=${NAME} and context->>'policy'=${POLICY} and status in('running','queued') and coalesce(context->>'dry_run','false')<>'true' order by created_at desc limit 1 for update`
  if(!run){
    if(mode==='resume')return {idle:true}
    const [due]=await tx`select (date_trunc('week',now() at time zone 'Europe/Zurich')+interval '2 days 9 hours') at time zone 'Europe/Zurich' due`
    if(mode==='weekly'&&Date.now()<new Date(due.due).getTime())return {idle:true,reason:'not_due'}
    const [prior]=await tx`select id,status from public.pipeline_runs where pipeline_name=${NAME} and context->>'policy'=${POLICY} and coalesce(context->>'dry_run','false')<>'true' and created_at>=${due.due}::timestamptz order by created_at desc limit 1`
    if(prior)return {idle:true,reason:'already_checked_this_week',run_id:prior.id}
    const [definition]=await tx`select id,is_enabled from public.pipeline_definitions where name=${NAME}`
    if(!definition?.is_enabled)return {idle:true,reason:'pipeline_disabled'}
    const context={policy:POLICY,results:{},source_cache:{},attempts:{}}
    ;[run]=await tx<RunRecord[]>`insert into public.pipeline_runs(pipeline_id,pipeline_name,status,started_at,triggered_by,context,items_total) values(${definition.id},${NAME},'running',now(),${mode},${tx.json(context)},21) returning *`
  }
  const ctx=await ledger(tx,run)
  if(ctx.lease_until&&Date.parse(ctx.lease_until)>Date.now())return {busy:true,run_id:run.id}
  const token=crypto.randomUUID()
  ctx.lease_token=token;ctx.lease_until=new Date(Date.now()+180000).toISOString()
  await persist(tx,run.id,ctx)
  return {run_id:run.id as string,token,context:ctx}
}
async function lockRun(tx:Tx,id:string,token:string){
  const [r]=await tx<RunRecord[]>`select id,context from public.pipeline_runs where id=${id}::uuid and pipeline_name=${NAME} and status='running' for update`
  if(!r)throw Error('lease_or_run_no_longer_active')
  const ctx=await ledger(tx,r)
  if(ctx.lease_token!==token||!Number.isFinite(Date.parse(ctx.lease_until??''))||Date.parse(ctx.lease_until??'')<=Date.now())throw Error('lease_or_run_no_longer_active')
  const [a]=await tx`select enabled from public.admin_automations where slug=${SLUG}`
  if(!a?.enabled)throw Error('automation_disabled')
  return ctx
}
export async function cache(db:Db,id:string,token:string,key:string,value:unknown){await db.begin(async tx=>{const ctx=await lockRun(tx,id,token);ctx.source_cache[key]=jsonValue(value);await persist(tx,id,ctx)})}

/** Called within one transaction: row locks, case locks and all approval writes. */
export async function applyDate(tx:Tx,id:string,fingerprint:string,c:Candidate,page:Page,runId:string,allowFixture=false) {
  if(!allowFixture&&!COHORT.some(t=>t.id===id))throw Error('outside_fixed_cohort')
  const [row]=await tx`select to_jsonb(e) event,md5(to_jsonb(e)::text) fingerprint from public.events e where id=${id}::uuid for update`
  if(!row||row.fingerprint!==fingerprint)return {state:'stale',reason:'event_changed_during_research'}
  const e=row.event as EventRecord
  if(e.enrichment_status?.date_confirmation?.state!=='needs_review'||e.review_status!=='pending')return {state:'skipped',reason:'no_longer_pending'}
  const protectedFields=['title','description','start_date','end_date'].filter(k=>e.field_provenance?.[k] && !['outxout','pipeline-commit'].includes(e.field_provenance[k].source))
  if(protectedFields.length)return {state:'blocked',reason:'protected_fields',fields:protectedFields}
  const aliases=await tx`select * from public.ingestion_staging where source_name='outxout' and target_table='events' and target_record_id=${id}::uuid for update`
  if(!aliases.length)return {state:'blocked',reason:'missing_source_alias'}
  const ids=[id,...aliases.map(a=>a.id)]
  const cases=await tx`select c.id from public.admin_review_cases c where active and (c.item->>'entity_id'=any(${ids}::text[]) or c.item->>'id'=any(${ids}::text[]) or exists(select 1 from jsonb_array_elements(c.members) m where m->>'entity_id'=any(${ids}::text[]) or m->>'id'=any(${ids}::text[]))) order by c.id for update`
  for(const r of cases){
    const [lock]=await tx`select api_private.try_lock_review_case(${r.id}::uuid) ok`
    if(!lock.ok)return {state:'blocked',reason:'active_review_lock'}
    const [busy]=await tx`select exists(select 1 from api_private.review_source_verification_leases where case_id=${r.id} and lease_expires_at>clock_timestamp()) or exists(select 1 from public.admin_review_automation_jobs where case_id=${r.id} and status='running' and lease_expires_at>clock_timestamp()) or exists(select 1 from public.admin_review_research_jobs where case_id=${r.id} and status='running' and lease_expires_at>clock_timestamp()) busy`
    if(busy.busy)return {state:'blocked',reason:'active_review_claim'}
  }
  const queue=await tx`select * from public.review_queue where entity_id=any(${ids}::uuid[]) and status='pending' for update`
  const issues=await tx`select id,issue_code from public.event_quality_issues where event_id=${id}::uuid and status='open' for update`
  const aliasBlocked=aliases.some(a=>a.review_status==='rejected'||(a.ai_validation_result?.errors??[]).length || (a.ai_validation_result?.warnings??[]).some((w:string)=>!['W_EVENT_DATE_UNCONFIRMED','W_NO_GEO'].includes(w)))
  const blockers=queue.some(q=>q.details?.reason!=='date_unconfirmed')||issues.length>0||aliasBlocked
  const confirmation={state:'confirmed',precision:'day',time_status:'unconfirmed',end_date_status:c.end?'confirmed_day':'unconfirmed',confirmed_date:c.start,confirmed_end_date:c.end,checked_at:new Date().toISOString(),source:'official-date-verification',source_url:page.url,evidence_sha256:page.sha256,pipeline_run_id:runId,policy:POLICY,storage_note:'UTC midnight is a date-only sentinel, not an announced start/end time.',previous:{title:e.title,description:e.description,start_date:e.start_date,end_date:e.end_date,review_status:e.review_status,date_confirmation:e.enrichment_status?.date_confirmation}}
  const title=cleanTitle(e.title),desc=description(title,c),status=blockers?'pending':'approved',start=`${c.start}T00:00:00Z`,end=c.end?`${c.end}T00:00:00Z`:null
  const provenance={...e.field_provenance,...Object.fromEntries(['title','description','start_date','end_date'].map(k=>[k,{source:'official-date-verification',source_url:page.url,precision:'day',time_status:'unconfirmed',at:confirmation.checked_at,pipeline_run_id:runId,previous:e[k]}]))}
  await tx`update public.events set title=${title},description=${desc},start_date=${start}::timestamptz,end_date=${end}::timestamptz,review_status=${status},enrichment_status=${tx.json({...e.enrichment_status,date_confirmation:confirmation})},field_provenance=${tx.json(provenance)},updated_at=now() where id=${id}::uuid`
  for(const a of aliases){
    const warnings=(a.ai_validation_result?.warnings??[]).filter((w:string)=>w!=='W_EVENT_DATE_UNCONFIRMED')
    const blocked=blockers||(a.ai_validation_result?.errors??[]).length>0
    const normalized={...a.normalized_data,name:title,title,description:desc,start_date:start,end_date:end,metadata:{...a.normalized_data?.metadata,date_status:'confirmed',date_precision:'day',time_status:'unconfirmed',official_date_confirmation:confirmation}}
    const validation={...a.ai_validation_result,warnings,official_date_confirmation:confirmation}
    await tx`update public.ingestion_staging set normalized_data=${tx.json(normalized)},ai_validation_result=${tx.json(validation)},ai_validation_status=${blocked?'needs_review':'approved'},review_status=${a.review_status==='rejected'?'rejected':blocked?a.review_status:'approved'},updated_at=now() where id=${a.id}`
    await tx`insert into public.ingestion_events(staging_id,stage,new_status,actor,payload) values(${a.id},'validate',${blocked?'needs_review':'approved'},'outxout-official-dates',${tx.json({pipeline_run_id:runId,official_date_confirmation:confirmation,previous:{normalized_data:a.normalized_data,ai_validation_result:a.ai_validation_result,ai_validation_status:a.ai_validation_status,review_status:a.review_status}})})`
  }
  // Public provenance contains factual dates and evidence references only.
  // Complete source captures and model decisions stay in the private run ledger.
  const evidence={confirmation,date_candidate:{start:c.start,end:c.end},evidence:{url:page.url,retrieved_at:page.retrieved_at,sha256:page.sha256}}
  await tx`insert into public.event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary,first_seen_at,last_seen_at) values(${id}::uuid,'official-date-verification',${id},${page.url},${tx.json(evidence)},${page.sha256},.97,false,now(),now()) on conflict(source_slug,source_entity_id) do update set source_url=excluded.source_url,payload=excluded.payload,payload_hash=excluded.payload_hash,confidence=excluded.confidence,last_seen_at=now()`
  await tx`update public.review_queue set status='resolved',resolved_at=now(),details=coalesce(details,'{}')||${tx.json({resolution:'date_verified_against_official_source',pipeline_run_id:runId})} where entity_id=any(${ids}::uuid[]) and status='pending' and details->>'reason'='date_unconfirmed'`
  const [readback]=await tx`select title,start_date,end_date,review_status,enrichment_status->'date_confirmation' confirmation from public.events where id=${id}::uuid`
  if(readback?.confirmation?.pipeline_run_id!==runId||readback.review_status!==status)throw Error('approval_readback_failed')
  return {state:blockers?'date_confirmed_pending_other_review':'approved',date:c.start,end_date:c.end,aliases:aliases.length,readback}
}
export async function save(db:Db,runId:string,token:string,id:string,result:RecordData,change?:{fingerprint:string;candidate:Candidate;page:Page}) {
  return await db.begin(async tx=>{
    const ctx=await lockRun(tx,runId,token)
    if(ctx.results[id])return ctx.results[id]
    const applied=change?await applyDate(tx,id,change.fingerprint,change.candidate,change.page,runId):null
    // Evidence/provenance plus checkpoint commit atomically; retries reconcile here.
    const final:RecordData={...result,...applied,checked_at:new Date().toISOString()}
    if(final.state==='unconfirmed'){
      await tx`update public.events set enrichment_status=jsonb_set(enrichment_status,'{date_confirmation}',(enrichment_status->'date_confirmation')||${tx.json({last_official_check:final.checked_at,backend_run_id:runId,check_result:result.reason,checked_urls:result.checked_urls})}),updated_at=now() where id=${id}::uuid and review_status='pending' and enrichment_status->'date_confirmation'->>'state'='needs_review'`
    }
    ctx.results[id]=final;ctx.lease_until=new Date(Date.now()+180000).toISOString()
    await persist(tx,runId,ctx)
    return final
  })
}
export async function failure(db:Db,id:string,token:string,eventId:string,error:string) {
  await db.begin(async tx=>{const ctx=await lockRun(tx,id,token);const n=(ctx.attempts[eventId]??0)+1;ctx.attempts[eventId]=n;ctx.last_error={event_id:eventId,error,at:new Date().toISOString()};ctx.retry_at=new Date(Date.now()+60000).toISOString();if(n>=3)ctx.results[eventId]={state:'error',reason:error,checked_at:new Date().toISOString()};await persist(tx,id,ctx)})
}
export async function finish(db:Db,id:string,token:string) {
  return await db.begin(async tx=>{
    const ctx=await lockRun(tx,id,token),results=Object.values(ctx.results) as RecordData[]
    const complete=results.length===21,approved=results.filter(r=>r.state==='approved').length,errors=results.filter(r=>r.state==='error').length
    delete ctx.lease_token;delete ctx.lease_until
    await persist(tx,id,ctx)
    const nodeStates={'official-dates':{status:complete?(errors?'failed':'completed'):'running',items_in:21,items_out:results.length,completed_at:complete?new Date().toISOString():null}}
    await tx`update public.pipeline_runs set node_states=${tx.json(nodeStates)},status=${complete?(errors?'failed':'completed'):'running'},items_processed=${results.length},items_succeeded=${results.length-errors},items_failed=${errors},completed_at=${complete?new Date():null},error_message=${complete&&errors?'Official-source checks exhausted retries; inspect run evidence':null},updated_at=now() where id=${id}::uuid`
    if(complete){
      await tx`update public.admin_automation_runs set status=${errors?'error':'success'},finished_at=now() where id=${ctx.ledger_id}::bigint`
      await tx`update public.admin_automations set last_run_at=now(),last_run_status=${errors?'error':'success'} where slug=${SLUG}`
      const [remaining]=await tx`select count(*) n from public.events where id=any(${COHORT.map(t=>t.id)}::uuid[]) and review_status='pending' and enrichment_status->'date_confirmation'->>'state'='needs_review'`
      if(Number(remaining.n)===0){await tx`update public.admin_automations set enabled=false where slug in(${SLUG},${CONTINUE})`;await tx`select cron.unschedule(jobid) from cron.job where jobname in(${SLUG},${CONTINUE})`}
    }
    return {success:true,run_id:id,pipeline_run_id:id,continuation_pending:!complete,examined:results.length,approved,errors}
  })
}
