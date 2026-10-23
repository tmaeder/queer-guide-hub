#!/usr/bin/env node
// Bounded native source repair. No retries of writes with unknown outcomes.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const args=process.argv.slice(2)
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const apply=args.includes('--apply')
const batch=Number(option('--batch','100'))
const maximum=Number(option('--max-batches','1'))
const output=option('--output',`outputs/historical-source-artwork-${Date.now()}.json`)
if(!Number.isInteger(batch)||batch<1||batch>500||!Number.isInteger(maximum)||maximum<1||maximum>200)throw Error('Use batch 1–500 and max-batches 1–200')
try { await readFile(output);throw Error('Use a fresh receipt path; existing journals must be retained') }
catch(error){if(error.code!=='ENOENT')throw error}
let token=process.env.SUPABASE_PAT
if(!token){
 const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()
 token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw
}
const report={started_at:new Date().toISOString(),apply,batch,maximum,receipts:[],complete:false}
await mkdir(dirname(output),{recursive:true})
const save=async()=>{await writeFile(`${output}.tmp`,JSON.stringify(report,null,2));await rename(`${output}.tmp`,output)}
await save()
for(let i=0;i<(apply?maximum:1);i++){
 const receipt={batch:i+1,started_at:new Date().toISOString(),status:'submitting'}
 report.receipts.push(receipt);await save()
 try{
  const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{
   method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
   body:JSON.stringify({query:`select public.reconcile_historical_graph_artwork(${batch},${!apply}) result`}),
   signal:AbortSignal.timeout(90_000),
  })
  if(!response.ok)throw Error(`Native request HTTP ${response.status}; reconcile before retrying`)
  const result=(await response.json())[0]?.result
  if(!result||(!result.skipped&&result.dry_run!==!apply))throw Error('Unexpected native receipt')
  receipt.status='completed';receipt.finished_at=new Date().toISOString();receipt.result=result
  await save()
  console.log(JSON.stringify({...result,event_ids:undefined,batch:i+1}))
  if(result.skipped){report.stop_reason='native_job_busy';break}
  if(!apply){report.stop_reason='preview_complete';break}
  if(!result.invalid_references_removed&&!result.source_outcomes_recorded){report.stop_reason='native_batch_no_changes';break}
 }catch(error){receipt.status='outcome_unknown';receipt.error=String(error.message).slice(0,500);await save();throw error}
}
report.complete=true;report.finished_at=new Date().toISOString();report.stop_reason??='batch_bound_reached'
await save()
