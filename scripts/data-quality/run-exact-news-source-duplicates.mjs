#!/usr/bin/env node
// Run the exact committed duplicate predicate without permanent production DDL.
import {readFile,writeFile,rename,readdir}from'node:fs/promises'
import {execFileSync}from'node:child_process'
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const mode=option('--mode','dry'),output=option('--output',null),batch=Number(option('--batch','50'))
if(!['dry','rehearsal','apply'].includes(mode)||!output||!Number.isInteger(batch)||batch<0||batch>100)throw Error('Use --mode dry|rehearsal|apply --output receipt.json [--batch 0..100]')
let token=process.env.SUPABASE_PAT
if(!token){const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw}
const directory=new URL('../../supabase/migrations/',import.meta.url)
const files=(await readdir(directory)).filter(name=>name.endsWith('_review_exact_news_source_duplicates.sql'))
if(files.length!==1)throw Error('Expected one exact-source duplicate migration')
const source=await readFile(new URL(files[0],directory),'utf8')
const matches=[...source.matchAll(/create function[\s\S]*?\$fn\$;/g)]
if(matches.length!==1)throw Error('Unexpected duplicate function contract')
const definition=matches[0][0].replaceAll('api_private.reconcile_exact_news_source_duplicates','pg_temp.reconcile_exact_news_source_duplicates')
const report={mode,batch,started_at:new Date().toISOString(),status:'sending'}
const save=async()=>{await writeFile(`${output}.tmp`,JSON.stringify(report,null,2));await rename(`${output}.tmp`,output)}
await save()
const query=`begin;set local statement_timeout='45s';set local lock_timeout='2s';set local app.actor='system:exact-news-source-duplicate:v1';${definition}\nselect pg_temp.reconcile_exact_news_source_duplicates(${batch},${mode==='dry'?'true':'false'})result;drop function pg_temp.reconcile_exact_news_source_duplicates(integer,boolean);${mode==='rehearsal'?'rollback':'commit'};`
const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)})
if(!response.ok){report.status='failed_or_unknown';report.http_status=response.status;await save();throw Error(`Native dedup HTTP ${response.status}; inspect authoritative state before retrying`)}
const data=await response.json(),result=data[0]?.result
if(!result||result.skipped||result.dry_run!==(mode==='dry')||!Number.isInteger(result.duplicate_sources)){
 report.status='refused_or_unknown';report.result=result;await save();throw Error('Native duplicate rule refused or returned an unexpected receipt')
}
report.status=mode==='rehearsal'?'rolled_back':'completed';report.result=result;report.finished_at=new Date().toISOString();await save()
console.log(JSON.stringify({mode,duplicates:result.duplicate_sources,committed:mode==='apply'?result.duplicate_sources:0,status:report.status}))
