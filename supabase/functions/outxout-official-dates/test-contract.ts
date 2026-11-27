import { applyDate, claimWithin, NAME, type Db } from './store.ts'
import { candidates, selectionRequest, verificationRequest, choose, verified, POLICY, type Page } from './policy.ts'
import { hash } from './sources.ts'
import type { JevRequest, JevResponse } from '../_shared/jev-client.ts'

/** Internal-only diagnostic exercises real approval code, then rolls everything back. */
export async function contractTest(db:Db){
  const evidence:Page={url:'https://belfastpride.com/',text:'Belfast Pride Parade is confirmed for 24 July 2027.',retrieved_at:new Date().toISOString(),sha256:'synthetic_transaction_test'}
  const c=candidates([evidence],2027)[0],checks:string[]=[]
  let rolledBack=false
  try{await db.begin(async tx=>{
    const [active]=await tx`select count(*) n from public.pipeline_runs where pipeline_name=${NAME} and status in('running','queued')`
    if(Number(active.n)!==0)throw Error('run_contract_only_when_real_worker_idle')
    const fixtureRun=crypto.randomUUID()
    await tx`insert into public.pipeline_runs(id,pipeline_name,status,context) values(${fixtureRun}::uuid,${NAME},'running',${tx.json({policy:POLICY,results:{},source_cache:{},attempts:{}})})`
    const first=await claimWithin(tx,'resume'),second=await claimWithin(tx,'resume')
    if(!first.token||second.busy!==true)throw Error('contract_durable_lease_failed')
    const [privateCheck]=await tx`select context ? 'source_cache' or context ? 'lease_token' leaked from public.pipeline_runs where id=${fixtureRun}::uuid`
    if(privateCheck.leaked)throw Error('contract_private_ledger_exposed')
    await tx`update public.admin_automation_runs set summary=jsonb_set(summary,'{lease_until}','"2000-01-01T00:00:00Z"') where id=${first.context.ledger_id}::bigint`
    const recovered=await claimWithin(tx,'resume')
    if(!recovered.token||recovered.token===first.token)throw Error('contract_expired_lease_not_recovered')
    checks.push('durable_lease_contention_and_recovery','private_ledger_not_public')
    for(const blocked of [false,true]){
      const id=crypto.randomUUID(),stage=crypto.randomUUID(),run=crypto.randomUUID()
      await tx`insert into public.events(id,title,description,event_type,start_date,end_date,timezone,city_id,review_status,enrichment_status) select ${id}::uuid,'Backend Date Contract Fixture (Date TBC)','Stale placeholder July 2027 text.','pride','2027-07-01T11:00Z','2027-07-02T21:00Z','Europe/London',city_id,'pending','{"date_confirmation":{"state":"needs_review","source":"outxout"}}'::jsonb from public.events where id='31ea1eb7-a913-4ed3-88ab-d57129b89bcc'`
      await tx`insert into public.ingestion_staging(id,source_name,source_type,source_entity_id,target_table,target_record_id,raw_data,normalized_data,ai_validation_status,ai_validation_result,review_status) values(${stage}::uuid,'outxout','api',${'event/__date_contract_'+id},'events',${id}::uuid,'{}','{"name":"Backend Date Contract Fixture (Date TBC)","metadata":{"date_status":"unconfirmed"}}','needs_review','{"errors":[],"warnings":["W_EVENT_DATE_UNCONFIRMED","W_NO_GEO"]}','auto')`
      await tx`insert into public.review_queue(entity_type,entity_id,review_type,details,status) values('ingestion_staging',${stage}::uuid,'ai_validation','{"reason":"date_unconfirmed"}','pending')`
      if(blocked)await tx`insert into public.review_queue(entity_type,entity_id,review_type,details,status) values('event',${id}::uuid,'ai_validation','{"reason":"unrelated_identity_issue"}','pending')`
      const [before]=await tx`select md5(to_jsonb(e)::text) fingerprint from public.events e where id=${id}::uuid`
      const applied=await applyDate(tx,id,before.fingerprint,c,evidence,run,true)
      if(applied.state!==(blocked?'date_confirmed_pending_other_review':'approved'))throw Error('contract_approval_guard_failed')
      const [after]=await tx`select start_date::text,end_date,title,review_status,enrichment_status->'date_confirmation' c from public.events where id=${id}::uuid`
      if(after.start_date!=='2027-07-24 00:00:00+00'||after.end_date!==null||after.title.includes('TBC')||after.c.precision!=='day'||after.c.time_status!=='unconfirmed')throw Error('contract_date_precision_failed')
      const [unrelated]=await tx`select count(*) n from public.review_queue where entity_id=${id}::uuid and details->>'reason'='unrelated_identity_issue' and status='pending'`
      if(Number(unrelated.n)!==Number(blocked))throw Error('contract_unrelated_review_resolved')
      const replay=await applyDate(tx,id,before.fingerprint,c,evidence,run,true)
      if(replay.state!=='stale')throw Error('contract_replay_not_guarded')
      const [aliases]=await tx`select normalized_data,ai_validation_result from public.ingestion_staging where id=${stage}::uuid`
      if(aliases.normalized_data.metadata.date_status!=='confirmed'||aliases.ai_validation_result.warnings.includes('W_EVENT_DATE_UNCONFIRMED')||!aliases.ai_validation_result.warnings.includes('W_NO_GEO'))throw Error('contract_alias_warning_failed')
      checks.push(blocked?'date_saved_unrelated_blocker_preserved':'canonical_alias_provenance_approval')
      checks.push('stale_replay_rejected')
    }
    throw Error('__rollback_date_contract__')
  })}catch(e){if(e instanceof Error&&e.message==='__rollback_date_contract__')rolledBack=true;else throw e}
  const [remaining]=await db`select count(*) n from public.events where title like 'Backend Date Contract Fixture%'`
  if(!rolledBack||Number(remaining.n)!==0)throw Error('contract_fixture_not_rolled_back')
  return {success:true,rolled_back:true,checks}
}
export async function runModelProbes(evaluate:(r:JevRequest)=>Promise<JevResponse>){
  const target={id:'synthetic',title:'Belfast Pride Parade 2027',city:'Belfast',year:2027,urls:[]},results=[]
  for(const [label,text,expected] of [
    ['exact','Belfast Pride Parade 2027: the parade will take place in Belfast on 24 July 2027. This is the confirmed parade day. The assembly time is to be announced.',true],
    ['parent_only','Belfast Pride Festival is confirmed for 24 July 2027. The separate Belfast Pride Parade 2027 date has not been announced and remains TBC.',false],
    ['provisional','Belfast Pride Parade in Belfast provisionally planned for 24 July 2027. Date TBC; please wait for confirmation.',false],
    ['other_city','The Pride Parade in Newcastle is confirmed for 24 July 2027. Belfast Pride Parade 2027 date has not been announced.',false],
  ] as const){
    const page:Page={url:'https://belfastpride.com/synthetic-contract',retrieved_at:new Date().toISOString(),sha256:await hash(text),text}
    const dates=candidates([page],2027),selection=await evaluate(selectionRequest(target,[page],dates)),candidate=choose(selection,dates)
    const verification=candidate?await evaluate(verificationRequest(target,[page],candidate)):null
    const accepted=!!verification&&verified(verification)
    results.push({label,accepted,expected,passed:accepted===expected,selection,verification})
  }
  return {success:results.every(r=>r.passed),synthetic:true,results}
}
