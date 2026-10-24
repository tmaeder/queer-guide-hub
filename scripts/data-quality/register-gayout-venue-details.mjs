#!/usr/bin/env node
import{execFileSync}from'node:child_process'
import{readFile,writeFile,mkdir,rename}from'node:fs/promises'
import{dirname}from'node:path'
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
const apply=args.includes('--apply'),rollback=args.includes('--rollback'),input=option('--proofs',null),output=option('--output',`outputs/gayout-details-${Date.now()}.json`)
if(!input||apply&&rollback)throw Error('Provide --proofs; choose at most one of --apply or --rollback')
try{await readFile(output);throw Error('Fresh journal path required')}catch(e){if(e.code!=='ENOENT')throw e}
const capture=JSON.parse(await readFile(input,'utf8')),proofs=capture.proofs
if(!Array.isArray(proofs)||proofs.length>50)throw Error('At most fifty source proofs')
const report={started_at:new Date().toISOString(),apply,rollback,input,proofs,status:'prepared',complete:false}
await mkdir(dirname(output),{recursive:true})
const save=async()=>{await writeFile(output+'.tmp',JSON.stringify(report,null,2));await rename(output+'.tmp',output)}
await save()
let token=process.env.SUPABASE_PAT
if(!token){const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw}
let query=await readFile(new URL('./register-gayout-venue-details.sql',import.meta.url),'utf8')
const literal=JSON.stringify(proofs).replaceAll("'","''")
query=query.replace('begin;',()=>`begin;\nselect set_config('matching.gayout_details_proofs','${literal}',true);\nselect set_config('matching.gayout_details_dry_run','${!apply&&!rollback}',true);`)
if(rollback)query=query.replace(/commit;\s*$/,'rollback;')
report.status='submitting';await save()
try{const r=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(70000)});if(!r.ok)throw Error(`Native HTTP ${r.status}; reconcile before retry: ${(await r.text()).slice(0,700)}`);report.result=(await r.json())[0]?.result;if(!report.result||report.result.dry_run!==(!apply&&!rollback))throw Error('Unexpected native receipt');report.status='completed';report.complete=true;report.finished_at=new Date().toISOString();await save();console.log(JSON.stringify({output,...report.result,rollback}))}catch(e){report.status='outcome_unknown';report.error=String(e.message);await save();throw e}
