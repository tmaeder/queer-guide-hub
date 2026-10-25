#!/usr/bin/env node
// Bounded native re-audits, using the ordinary image worker and its singleton
// lease. An interrupted or ambiguous write is journaled and never retried.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const args=process.argv.slice(2)
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const apply=args.includes('--apply'),batch=Number(option('--batch','20'))
const idsPath=option('--ids-file',null),output=option('--output',`outputs/event-artwork-rechecks-${Date.now()}.json`)
if(!idsPath||!Number.isInteger(batch)||batch<1||batch>20)throw Error('--ids-file and batch 1–20 required')
try{await readFile(output);throw Error('Use a fresh journal path')}catch(error){if(error.code!=='ENOENT')throw error}
const ids=JSON.parse(await readFile(idsPath,'utf8'))
if(!Array.isArray(ids)||ids.length>2000||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)))throw Error('At most 2,000 distinct native event UUIDs required')
let token=process.env.SUPABASE_PAT
if(!token){
 const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()
 token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw
}
const sql=async(query)=>{
 const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query}),signal:AbortSignal.timeout(60_000),
 })
 if(!response.ok)throw Error(`Native SQL HTTP ${response.status}; inspect receipt before retrying`)
 return response.json()
}
const report={started_at:new Date().toISOString(),apply,ids,receipts:[],complete:false}
await mkdir(dirname(output),{recursive:true})
const save=async()=>{await writeFile(`${output}.tmp`,JSON.stringify(report,null,2));await rename(`${output}.tmp`,output)}
await save()
for(let offset=0;offset<ids.length;offset+=batch){
 const selected=ids.slice(offset,offset+batch)
 const receipt={ids:selected,status:'submitting',submitted_at:new Date().toISOString()}
 report.receipts.push(receipt);await save()
 try{
  const body=JSON.stringify({event_ids:selected,batch_size:selected.length,dry_run:!apply})
  const sent=await sql(`select public.automation_http_post(
   url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/event-image-quality',
   headers:=jsonb_build_object('Content-Type','application/json',
    'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key'),
    'X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
   body:='${body}'::jsonb,timeout_milliseconds:=180000)request_id`)
  receipt.request_id=Number(sent[0]?.request_id)
  if(!Number.isSafeInteger(receipt.request_id))throw Error('Missing native request ID')
  receipt.status='waiting';await save()
  let native
  for(let poll=0;poll<45;poll++){
   await new Promise(resolve=>setTimeout(resolve,5000))
   const rows=await sql(`select status_code,timed_out,content,error_msg from net._http_response where id=${receipt.request_id}`)
   if(rows.length){native=rows[0];break}
  }
  if(!native||native.timed_out)throw Error('Native outcome not confirmed')
  receipt.http_status=native.status_code
  receipt.result=JSON.parse(native.content)
  receipt.status='completed';receipt.finished_at=new Date().toISOString();await save()
  console.log(JSON.stringify({batch:report.receipts.length,request_id:receipt.request_id,http_status:native.status_code,
   checked:receipt.result.checked,failures:receipt.result.failures,dry_run:!apply,runtime_revision:receipt.result.runtime_revision}))
  if(native.status_code!==200||receipt.result.success!==true){report.stop_reason='native_failure';break}
  if(receipt.result.checked!==selected.length){report.stop_reason='native_busy_or_ineligible';break}
  if(!apply){report.stop_reason='preview_complete';break}
 }catch(error){receipt.status='outcome_unknown';receipt.error=String(error.message).slice(0,300);await save();throw error}
}
report.complete=true;report.finished_at=new Date().toISOString();report.stop_reason??='bounded_input_complete';await save()
