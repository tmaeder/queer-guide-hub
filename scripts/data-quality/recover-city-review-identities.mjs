#!/usr/bin/env node
// Drive the existing city factual resolver against the actual unresolved review
// population. No identity decisions, source classifications or quality counters
// are written here; all enrichment uses the native corroboration/ownership rules.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const option = (name, fallback) => { const i=args.indexOf(name); return i<0 ? fallback : args[i+1] }
const apply = args.includes('--apply')
const batchSize = Number(option('--batch', '20'))
const maxBatches = Number(option('--max-batches', '10'))
const output = option('--output', `outputs/city-review-identity-${apply?'apply':'dry'}-${Date.now()}.json`)
const skipReport = option('--skip-report', null)
if (!Number.isInteger(batchSize) || batchSize<1 || batchSize>40 || !Number.isInteger(maxBatches) || maxBatches<1 || maxBatches>500) throw new Error('Bounded batch (1–40) and run (1–500) required')
const project = 'xqeacpakadqfxjxjcewc'
let token = process.env.SUPABASE_PAT
if (!token) {
  let raw
  try { raw = execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim() }
  catch { throw new Error('Existing Supabase CLI account or SUPABASE_PAT required') }
  token = raw.startsWith('go-keyring-base64:') ? Buffer.from(raw.slice(18),'base64').toString('utf8') : raw
}
async function sql(query, readOnly = false) {
  for (let attempt=0;attempt<3;attempt++) {
    let response
    try {
      response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({query}),signal:AbortSignal.timeout(60_000),
      })
    } catch (error) {
      if (!readOnly || attempt===2) throw error
      await new Promise(resolve=>setTimeout(resolve,3000*(attempt+1)))
      continue
    }
    if (response.ok) return response.json()
    if (!readOnly || attempt===2 || ![502,503,504].includes(response.status)) {
      throw new Error(`Management query failed (${response.status}); inspect native diagnostics`)
    }
    await response.body?.cancel()
    await new Promise(resolve=>setTimeout(resolve,3000*(attempt+1)))
  }
  throw new Error('Read retry bound exhausted')
}
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms))
let skippedIds=[]
if (skipReport) {
  const previous=JSON.parse(await readFile(skipReport,'utf8'))
  if (previous.apply!==true || !Array.isArray(previous.receipts)) throw new Error('An actual native recovery report is required')
  if (previous.receipts.some(receipt=>receipt.status!=='completed')) throw new Error('Reconcile all prior request receipts before resuming; an unknown write must not be replayed')
  skippedIds=[...new Set([...(previous.skipped_ids??[]),...previous.receipts.filter(r=>r.status==='completed').flatMap(r=>r.ids)])]
  if (skippedIds.some(id=>typeof id!=='string' || !/^[0-9a-f-]{36}$/.test(id))) throw new Error('Invalid prior native identity')
}
const skipClause=skippedIds.length ? `and not(c.id=any(array[${skippedIds.map(id=>`'${id}'::uuid`).join(',')}]))` : ''
// Keep each source resolver batch in the same country where possible, so its
// existing country/class caches avoid repeated upstream entity reads.
const candidates = await sql(`select distinct c.id,c.country_id from public.review_queue q join public.cities c on c.id=q.entity_id
 where q.review_type='CITY_IDENTITY_AMBIGUOUS' and q.status='pending' and c.wikidata_qid is null
 and c.duplicate_of_id is null and c.shell_status<>'merged'
 and coalesce(c.enrichment_status#>>'{disposition,state}','')<>'not_a_city'
 and c.latitude between -90 and 90 and c.longitude between -180 and 180
 ${skipClause}
 order by c.country_id nulls last,c.id limit ${batchSize*maxBatches}`,true)
const report = { started_at:new Date().toISOString(),apply,skip_report:skipReport,skipped_ids:skippedIds,candidate_ids:candidates.map(c=>c.id),receipts:[],totals:{processed:0,updated:0,failed:0},complete:false }
await mkdir(dirname(output),{recursive:true})
// Keep the last complete receipt journal intact if a full disk interrupts a
// write. A partial JSON file cannot safely tell an operator what ran already.
const save = async () => {
  const temporary = `${output}.tmp`
  await writeFile(temporary,JSON.stringify(report,null,2))
  await rename(temporary,output)
}
await save()
for (let offset=0;offset<candidates.length;offset+=batchSize) {
  const ids=candidates.slice(offset,offset+batchSize).map(c=>c.id)
  // Values originate from native UUID columns; still validate before SQL quoting.
  if (ids.some(id=>!/^[0-9a-f-]{36}$/.test(id))) throw new Error('Invalid native identity')
  const payload=JSON.stringify({phase:'link',batch_limit:batchSize,city_ids:ids,relink:true,dry_run:!apply})
  // Preserve the intended identities before submitting a write. A connection
  // failure after submission can otherwise leave no journal entry at all.
  const receipt={offset,ids,status:'submitting',submitted_at:new Date().toISOString()}
  report.receipts.push(receipt)
  await save()
  const sent=await sql(`select public.automation_http_post(
   url:='https://${project}.supabase.co/functions/v1/city-factual-backfill',
   headers:=jsonb_build_object('Content-Type','application/json',
    'X-Webhook-Secret',(select decrypted_secret from vault.decrypted_secrets where name='city_quality_webhook_secret')),
   body:='${payload}'::jsonb,timeout_milliseconds:=180000) request_id`)
  const rid=Number(sent[0]?.request_id)
  if (!Number.isSafeInteger(rid)) throw new Error('No native request receipt')
  receipt.request_id=rid
  receipt.status='waiting'
  await save()
  let response
  for (let poll=0;poll<45;poll++) {
    await sleep(5000)
    const rows=await sql(`select status_code,timed_out,content,error_msg from net._http_response where id=${rid}`,true)
    if (rows.length) { response=rows[0];break }
  }
  if (!response || response.timed_out || response.status_code!==200) {
    receipt.status='outcome_unknown';receipt.http_status=response?.status_code
    await save()
    throw new Error(`Request ${rid} has an unknown outcome; preserve receipt and inspect native writes before any retry`)
  }
  const data=JSON.parse(response.content)
  receipt.status='completed';receipt.result=data
  for (const key of Object.keys(report.totals)) report.totals[key]+=Number(data[key]??0)
  await save()
  console.log(JSON.stringify({batch:report.receipts.length,request_id:rid,processed:data.processed,updated:data.updated,failed:data.failed,dry_run:!apply}))
  if (data.error || data.circuit_open || data.failed || data.wikidata_fetch_failed) throw new Error('Native enrichment requires attention; stopping before the next batch')
  if (!apply) break
  await sleep(3000)
}
report.complete=true;report.finished_at=new Date().toISOString()
await save()
console.log(JSON.stringify({output,...report.totals,apply,quality_queue_reconciled:false}))
