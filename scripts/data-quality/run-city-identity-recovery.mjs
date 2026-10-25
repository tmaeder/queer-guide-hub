#!/usr/bin/env node
// Fresh source proofs only; one bounded native transaction, no unknown retries.
import {readFile,writeFile,rename,access}from'node:fs/promises'
import {execFileSync}from'node:child_process'
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const mode=option('--mode','dry'),input=option('--evidence',null),output=option('--output',null)
if(!['dry','rehearsal','apply'].includes(mode)||!input||!output)throw Error('Use --mode dry|rehearsal|apply --evidence proofs.json --output fresh-receipt.json')
try{await access(output);throw Error('Preserve the existing native receipt; choose a fresh output')}catch(error){if(error.code!=='ENOENT')throw error}
const {proofs}=JSON.parse(await readFile(input,'utf8'))
if(!Array.isArray(proofs)||proofs.length>20||Buffer.byteLength(JSON.stringify(proofs))>4000000)throw Error('At most 20 bounded source proofs required')
let token=process.env.SUPABASE_PAT
if(!token){const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw}
let sql=await readFile(new URL('./reconcile-discovered-city-identities.sql',import.meta.url),'utf8')
if(mode!=='dry')sql=sql.replace('dry_run boolean:=true','dry_run boolean:=false')
if(mode==='rehearsal')sql=sql.replace(/commit;\s*$/,'rollback;')
sql=sql.replace('do $repair$',`select set_config('matching.city_classification_proofs','${JSON.stringify(proofs).replaceAll("'","''")}',true);\ndo $repair$`)
const report={mode,started_at:new Date().toISOString(),status:'sending',ids:proofs.map(p=>p.id)}
const save=async()=>{await writeFile(`${output}.tmp`,JSON.stringify(report,null,2));await rename(`${output}.tmp`,output)}
await save()
const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(75000)})
if(!response.ok){const data=await response.json().catch(()=>({}));report.status='failed_or_unknown';report.http_status=response.status;report.error=String(data.message??'Native request failed').split('\n')[0].slice(0,300);await save();throw Error(`Native repair HTTP ${response.status}: ${report.error}; inspect authoritative outcome before retrying`)}
const data=await response.json(),result=data.at(-1)?.result
if(!result||result.dry_run!==(mode==='dry')||!Number.isInteger(result.eligible)||!Number.isInteger(result.repaired)){report.status='refused_or_unknown';await save();throw Error('Unexpected native receipt')}
report.result=result;report.status=mode==='rehearsal'?'rolled_back':'completed';report.finished_at=new Date().toISOString();await save()
console.log(JSON.stringify({mode,...result,committed:mode==='apply'?result.repaired:0}))
