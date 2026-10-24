#!/usr/bin/env node
// Register complete public source captures and verified business websites. Unknown writes are never retried.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const args=process.argv.slice(2)
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const apply=args.includes('--apply'),rollback=args.includes('--rollback')
const evidencePath=option('--proofs',null)
const output=option('--output',`outputs/overture-contact-registration-${Date.now()}.json`)
if(!evidencePath)throw Error('--proofs requires a captured public contact evidence file')
try{await readFile(output);throw Error('Use a fresh journal path')}catch(error){if(error.code!=='ENOENT')throw error}
const capture=JSON.parse(await readFile(evidencePath,'utf8'))
if(!Array.isArray(capture.proofs))throw Error('Captured source proofs required')
const evidence={...capture,proofs:capture.proofs.filter(proof=>proof.website_probe?.usable===true)}
if(!Array.isArray(evidence.proofs)||evidence.proofs.length>20)throw Error('At most twenty positive source proofs required')
const report={started_at:new Date().toISOString(),apply,rollback,evidence_path:evidencePath,status:'prepared',proofs:evidence.proofs,complete:false}
await mkdir(dirname(output),{recursive:true})
const save=async()=>{await writeFile(`${output}.tmp`,JSON.stringify(report,null,2));await rename(`${output}.tmp`,output)}
await save()
let token=process.env.SUPABASE_PAT
if(!token){
 const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()
 token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw
}
let query=await readFile(new URL('./register-overture-contact-evidence.sql',import.meta.url),'utf8')
const jsonLiteral=JSON.stringify(evidence.proofs).replaceAll("'","''")
query=query.replace('begin;',()=>`begin;\nselect set_config('matching.overture_proofs','${jsonLiteral}',true);\nselect set_config('matching.overture_dry_run','${!apply}',true);`)
if(rollback)query=query.replace(/commit;\s*$/,'rollback;')
report.status='submitting';await save()
try{
 const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query}),signal:AbortSignal.timeout(90_000),
 })
 if(!response.ok)throw Error(`Native request HTTP ${response.status}; inspect outcome before retrying`)
 report.result=(await response.json())[0]?.result
 if(!report.result||report.result.dry_run!==!apply)throw Error('Unexpected native registration receipt')
 report.status='completed';report.complete=true;report.finished_at=new Date().toISOString();await save()
 console.log(JSON.stringify({output,rollback,...report.result}))
}catch(error){report.status='outcome_unknown';report.error=String(error.message).slice(0,300);await save();throw error}
