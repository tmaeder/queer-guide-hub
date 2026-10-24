#!/usr/bin/env node
// Native source observations only. Default dry run; unknown writes never retry.
import{execFileSync}from'node:child_process'
import{readFile,writeFile,mkdir,rename}from'node:fs/promises'
import{dirname}from'node:path'
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
const input=option('--proofs',null),output=option('--output',`outputs/wikipedia-source-observations-${Date.now()}.json`),apply=args.includes('--apply'),rollback=args.includes('--rollback')
if(!input||apply&&rollback)throw Error('Provide --proofs; choose at most one of --apply or --rollback')
try{await readFile(output);throw Error('Fresh journal path required')}catch(e){if(e.code!=='ENOENT')throw e}
const capture=JSON.parse(await readFile(input,'utf8'))
if(capture.complete!==true||!Array.isArray(capture.proofs)||capture.proofs.length>100)throw Error('At most one hundred complete source observations')
const report={started_at:new Date().toISOString(),apply,rollback,input,proofs:capture.proofs,status:'prepared',complete:false}
await mkdir(dirname(output),{recursive:true})
const save=async()=>{await writeFile(output+'.tmp',JSON.stringify(report,null,2));await rename(output+'.tmp',output)}
await save()
let token=process.env.SUPABASE_PAT
if(!token){const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw}
const literal=JSON.stringify(capture.proofs).replaceAll("'","''"),dry=!apply&&!rollback
const query=`begin;set local statement_timeout='45s';set local lock_timeout='2s';set local app.actor='system:wikipedia-source-presence:v1';select public.register_wikipedia_source_observations('${literal}'::jsonb,${dry}) result;${rollback?'rollback':'commit'};`
report.status='submitting';await save()
try{const r=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(70000)});if(!r.ok)throw Error(`Native HTTP ${r.status}; reconcile before retry: ${(await r.text()).slice(0,500)}`);report.result=(await r.json())[0]?.result;if(!report.result||report.result.dry_run!==dry)throw Error('Unexpected native receipt');report.status='completed';report.complete=true;report.finished_at=new Date().toISOString();await save();console.log(JSON.stringify({output,rollback,...report.result}))}catch(e){report.status='outcome_unknown';report.error=String(e.message);await save();throw e}
