#!/usr/bin/env node
// Use the exact committed predicate in a temporary transaction; no public DDL.
import {readFile,writeFile,readdir}from'node:fs/promises'
import {execFileSync}from'node:child_process'
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const mode=option('--mode','dry'),output=option('--output',null),batch=Number(option('--batch','50'))
if(!['dry','rehearsal','apply'].includes(mode)||!output||!Number.isInteger(batch)||batch<0||batch>100)throw Error('Use --mode dry|rehearsal|apply --output receipt.json [--batch 0..100]')
let token=process.env.SUPABASE_PAT
if(!token){const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw}
const directory=new URL('../../supabase/migrations/',import.meta.url)
const files=(await readdir(directory)).filter(name=>name.endsWith('_source_explicit_event_formats.sql'))
if(files.length!==1)throw Error('Expected one committed source-format migration')
const source=await readFile(new URL(files[0],directory),'utf8')
const definitions=[...source.matchAll(/create function[\s\S]*?\$fn\$;/g)].map(match=>match[0])
if(definitions.length!==2)throw Error('Unexpected source-format function contract')
const temporary=definitions.join('\n').replaceAll('api_private.source_explicit_event_format','pg_temp.source_explicit_event_format').replaceAll('api_private.reconcile_source_event_formats','pg_temp.reconcile_source_event_formats')
const report={mode,batch,started_at:new Date().toISOString(),status:'sending'}
await writeFile(output,JSON.stringify(report,null,2))
const query=`begin;set local statement_timeout='45s';set local lock_timeout='2s';set local app.actor='system:source-explicit-event-format:v1';${temporary}\nselect pg_temp.reconcile_source_event_formats(${batch},${mode==='dry'?'true':'false'})result;drop function pg_temp.reconcile_source_event_formats(integer,boolean);drop function pg_temp.source_explicit_event_format(text);${mode==='rehearsal'?'rollback':'commit'};`
const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)})
if(!response.ok){report.status='failed_or_unknown';report.http_status=response.status;await writeFile(output,JSON.stringify(report,null,2));throw Error(`Native repair HTTP ${response.status}; inspect authoritative state before retrying`)}
const data=await response.json(),result=data[0]?.result
if(!result||result.skipped||result.dry_run!==(mode==='dry')||!Number.isInteger(result.corrected_events)){
 report.status='refused_or_unknown';report.result=result;await writeFile(output,JSON.stringify(report,null,2));throw Error('Native repair refused or returned an unexpected receipt')
}
report.status=mode==='rehearsal'?'rolled_back':'completed';report.result=result;report.finished_at=new Date().toISOString()
await writeFile(output,JSON.stringify(report,null,2))
console.log(JSON.stringify({mode,corrected:result.corrected_events,committed:mode==='apply'?result.corrected_events:0,status:report.status}))
