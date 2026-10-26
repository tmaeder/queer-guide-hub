#!/usr/bin/env node
// Runs the committed predicate transaction-locally; never installs public DDL.
import {readFile,writeFile,readdir}from'node:fs/promises'
import {execFileSync}from'node:child_process'
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const mode=option('--mode','dry'),output=option('--output',null)
const batch=Number(option('--batch','50')),maxBatches=Number(option('--max-batches','8'))
if(!['dry','rehearsal','apply'].includes(mode)||!output||!Number.isInteger(batch)||batch<0||batch>200||!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>12)throw Error('Use --mode dry|rehearsal|apply --output receipt.json [--batch 0..200] [--max-batches 1..12]')
let token=process.env.SUPABASE_PAT
if(!token){const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw}
const dir=new URL('../../supabase/migrations/',import.meta.url)
const files=(await readdir(dir)).filter(name=>name.endsWith('_source_referenced_event_venues.sql'))
if(files.length!==1)throw Error('Expected one committed source-reference migration')
const source=await readFile(new URL(files[0],dir),'utf8')
const definition=source.slice(0,source.indexOf('$fn$;')+6).replace('api_private.reconcile_source_referenced_event_venues','pg_temp.reconcile_source_referenced_event_venues')
const report={started_at:new Date().toISOString(),mode,batch,receipts:[],complete:false}
await writeFile(output,JSON.stringify(report,null,2))
for(let index=0;index<(mode==='apply'?maxBatches:1);index++){
 const receipt={index,status:'sending'};report.receipts.push(receipt);await writeFile(output,JSON.stringify(report,null,2))
 const query=`begin;set local statement_timeout='75s';set local lock_timeout='2s';${definition}\nselect pg_temp.reconcile_source_referenced_event_venues(${batch},${mode==='dry'?'true':'false'})as result;drop function pg_temp.reconcile_source_referenced_event_venues(integer,boolean);${mode==='rehearsal'?'rollback':'commit'};`
 const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(90000)})
 if(!response.ok){const error=await response.json().catch(()=>({}));receipt.status='failed_or_unknown';receipt.http_status=response.status;receipt.error=String(error.message??'Native request failed').slice(0,1000);await writeFile(output,JSON.stringify(report,null,2));throw Error(`Batch HTTP ${response.status}: ${receipt.error}`)}
 const data=await response.json(),result=data[0]?.result
 if(!result||result.skipped||result.dry_run!==(mode==='dry')||typeof result.linked_events!=='number'){
  receipt.status='refused_or_unknown';receipt.result=result;await writeFile(output,JSON.stringify(report,null,2));throw Error('Native repair refused or returned an unexpected receipt')
 }
 receipt.status=mode==='rehearsal'?'rolled_back':'completed';receipt.result=result;await writeFile(output,JSON.stringify(report,null,2))
 console.log(JSON.stringify({index,mode,candidates:result.candidates,linked:result.linked_events,pins:result.corrected_pins,review_findings:result.resolved_review_findings,quality_findings:result.resolved_quality_findings}))
 if(result.linked_events===0)break
}
report.complete=true;report.finished_at=new Date().toISOString();await writeFile(output,JSON.stringify(report,null,2))
console.log(JSON.stringify({mode,committed:mode==='apply'?report.receipts.reduce((sum,r)=>sum+r.result.linked_events,0):0,complete:true}))
