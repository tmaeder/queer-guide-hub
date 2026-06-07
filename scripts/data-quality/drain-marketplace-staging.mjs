#!/usr/bin/env node
// Drain a bulk marketplace staging backlog fast.
//
// The marketplace DAG processes one batch per run and its run-scoped nodes filter
// staging by pipeline_run_id — so a source that dumps thousands of rows in one run
// leaves all-but-one-batch orphaned (no later run, idempotency blocks re-staging).
// This drives a source-less 'marketplace-drain' pipeline (normalize→validate→
// relevance→dedup→quality→review→commit→mirror→embed) with a large batch_size,
// re-tagging a fresh slice of orphans to each run so they flow through the REAL
// node logic (no hand-reimplementation). Nodes are fast; the ~8-min/run cost is
// the dispatcher tick cadence, so we run a few waves concurrently.
//
// Usage: node scripts/data-quality/drain-marketplace-staging.mjs [source_type] [batch] [waves_concurrency]
//   default: ohmyfantasy 250 2
//
// Batch sizing (load-bearing): the dedup node OOMs (HTTP 546) and the commit RPC
// hits statement-timeout above a few hundred rows/run (per-row search_documents
// re-index), and concurrent commits contend on its advisory lock. Keep batch
// ≤300 and concurrency low. For a backlog that is already review-approved, the
// fastest path is to drive the committer directly in a loop, bypassing the
// per-node dispatcher cadence:
//   select commit_marketplace_staging_batch(150, null);   -- commits dedup='unique' rows
// (repeat until it returns no 'inserted' rows). dedup can likewise be driven
// globally: POST {batch_size:250} to /functions/v1/pipeline-deduplicate.

import { execFileSync } from 'node:child_process'
const PROJECT='xqeacpakadqfxjxjcewc'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8'
const SOURCE = process.argv[2] || 'ohmyfantasy'
const BATCH  = Number(process.argv[3] || 250)
const CONC   = Number(process.argv[4] || 2)

function token(){ if(process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8'}).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/,''),'base64').toString('utf8') }
const TOKEN=token()
async function sql(query, tries=5){
  for(let i=0;i<tries;i++){
    try{
      const res=await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`,{method:'POST',
        headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'},body:JSON.stringify({query})})
      if(res.status>=500||res.status===429) throw new Error(`transient ${res.status}`)
      if(!res.ok) throw new Error(`mgmt ${res.status}: ${(await res.text()).slice(0,400)}`)
      return res.json()
    }catch(e){ if(i===tries-1) throw e; await new Promise(r=>setTimeout(r,2000*(i+1))) }
  }
}
const J=(o)=>`'${JSON.stringify(o).replace(/'/g,"''")}'::jsonb`
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const ts=()=>new Date().toISOString().slice(11,19)

// "Needs processing" = staged for this source, not yet committed to the live
// table, and still in a publishable state — either pre-validate ('pending') or
// already sitting in the review queue (re-approved by the lowered threshold).
const PENDING_PRED = `source_type='${SOURCE}' and coalesce(disposition,'') <> 'committed' and (ai_validation_status='pending' or review_status='pending_review')`

async function ensurePipeline(){
  const nodes=[
    {id:'normalize',type:'normalizer',position:{x:50,y:200},data:{label:'Normalize',config:{}}},
    {id:'validate',type:'validator',position:{x:250,y:200},data:{label:'Validate',config:{entityType:'marketplace'}}},
    {id:'relevance',type:'marketplace-relevance',position:{x:450,y:200},data:{label:'Relevance',config:{threshold:0.5}}},
    {id:'dedup',type:'deduplicator',position:{x:650,y:200},data:{label:'Dedup',config:{review_min:0.80,auto_merge_min:0.95}}},
    {id:'quality',type:'quality-scorer',position:{x:850,y:200},data:{label:'Quality',config:{}}},
    // Trusted-merchant auto-publish: combinedScore = confidence*0.6 + quality/100*0.4.
    // quality_score isn't populated for marketplace (caps score ~0.60), so the
    // default autoApproveAbove=0.9 forces everything to review. ohmyfantasy is a
    // known affiliate whose products already passed the relevance gate — approve
    // relevance-survivors automatically. (User-approved 2026-06-07.)
    {id:'review',type:'review-gate',position:{x:1050,y:200},data:{label:'Review',config:{autoApproveAbove:0.55,minConfidence:0}}},
    {id:'commit',type:'committer',position:{x:1250,y:200},data:{label:'Commit',config:{targetTable:'marketplace_listings'}}},
    {id:'mirror',type:'marketplace-image-mirror',position:{x:1450,y:140},data:{label:'Mirror',config:{limit:25}}},
    {id:'embed',type:'embedding-generator',position:{x:1450,y:260},data:{label:'Embed',config:{targetTable:'marketplace_listings'}}},
  ]
  const edges=[
    {id:'d-nv',source:'normalize',target:'validate'},{id:'d-vr',source:'validate',target:'relevance'},
    {id:'d-rd',source:'relevance',target:'dedup'},{id:'d-dq',source:'dedup',target:'quality'},
    {id:'d-qr',source:'quality',target:'review'},{id:'d-rc',source:'review',target:'commit'},
    {id:'d-cm',source:'commit',target:'mirror'},{id:'d-ce',source:'commit',target:'embed'},
  ]
  await sql(`insert into pipeline_definitions (name, display_name, description, nodes, edges, default_context, max_concurrency, timeout_seconds, is_enabled)
    values ('marketplace-drain','Marketplace Drain (source-less)','Drives staged marketplace rows through the pipeline in large batches',
     ${J(nodes)}, ${J(edges)}, ${J({batch_size:BATCH})}, 8, 600, true)
    on conflict (name) do update set nodes=excluded.nodes, edges=excluded.edges, default_context=excluded.default_context, updated_at=now()`)
}

async function startRun(){
  const [{request_id}] = await sql(`select net.http_post(
    url:='https://${PROJECT}.supabase.co/functions/v1/pipeline-executor',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ${ANON}',
      'X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
    body:='{"action":"start","pipeline_name":"marketplace-drain","triggered_by":"drain"}'::jsonb,
    timeout_milliseconds:=60000) as request_id`)
  // pg_net is async — poll for the response to get the run id
  for(let i=0;i<20;i++){ await sleep(1500)
    const r=await sql(`select content from net._http_response where id=${request_id}`)
    if(r[0]?.content){
      try{ const id=JSON.parse(r[0].content).pipeline_run_id; if(id) return id }catch{}
      if(/Pipeline not found/.test(r[0].content)) throw new Error('pipeline marketplace-drain not found')
    }
  }
  // fallback: newest running drain run created in the last 30s
  const r=await sql(`select id from pipeline_runs where pipeline_name='marketplace-drain' and status='running' and created_at>now()-interval '40 seconds' order by created_at desc limit 1`)
  if(r[0]?.id) return r[0].id
  throw new Error('no run id from executor start')
}

async function tagSlice(runId){
  // Pick only rows not currently held by another live drain run (NULL run or a
  // run that has finished) — prevents concurrent waves from stealing each other's
  // freshly-tagged slices.
  const rows = await sql(`with picked as (
      select id from ingestion_staging
      where ${PENDING_PRED}
        and (pipeline_run_id is null
             or pipeline_run_id in (select id from pipeline_runs where status in ('completed','failed')))
      order by id limit ${BATCH} for update skip locked)
    update ingestion_staging s set pipeline_run_id='${runId}' from picked where s.id=picked.id
    returning s.id`)
  return rows.length
}

async function runStatus(runId){ const r=await sql(`select status from pipeline_runs where id='${runId}'`); return r[0]?.status }
async function remaining(){ const r=await sql(`select count(*)::int n from ingestion_staging where ${PENDING_PRED}`); return r[0].n }

async function main(){
  console.log(`[${ts()}] drain ${SOURCE} batch=${BATCH} conc=${CONC}`)
  await ensurePipeline()
  let wave=0
  for(;;){
    const rem = await remaining()
    console.log(`[${ts()}] remaining=${rem}`)
    if(rem===0){ console.log('DONE'); break }
    wave++
    // launch up to CONC concurrent runs, each adopting a disjoint slice
    const runs=[]
    for(let c=0;c<CONC;c++){
      const left = await remaining()
      if(left===0) break
      const R = await startRun()
      const tagged = await tagSlice(R)
      console.log(`[${ts()}] wave ${wave}.${c+1} run=${R.slice(0,8)} tagged=${tagged}`)
      runs.push(R)
      if(tagged<BATCH) break
    }
    // wait for this wave to finish (cap ~14 min)
    const deadline=Date.now()+14*60*1000
    for(;;){
      await sleep(20000)
      const sts=await Promise.all(runs.map(runStatus))
      const done=sts.every(s=>s==='completed'||s==='failed')
      console.log(`[${ts()}] wave ${wave} states: ${sts.join(',')}`)
      if(done) break
      if(Date.now()>deadline){ console.log(`[${ts()}] wave ${wave} timeout — continuing`); break }
    }
  }
  // final tally
  const [{active}] = await sql(`select count(*)::int active from marketplace_listings where source_type='${SOURCE}' and status='active'`)
  const [{review}] = await sql(`select count(*)::int review from ingestion_staging where source_type='${SOURCE}' and review_status='pending_review'`)
  console.log(`[${ts()}] FINAL active=${active} pending_review=${review}`)
}
main().catch(e=>{console.error('FATAL',e);process.exit(1)})
