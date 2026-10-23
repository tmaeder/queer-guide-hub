#!/usr/bin/env node
// Bounded operator for the source collector's fresh proofs. Never exports credentials.
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const args=process.argv.slice(2)
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback
const mode=option('--mode','dry')
const input=option('--input',null),output=option('--output',null)
if(!['dry','rehearsal','apply'].includes(mode)||!input||!output)throw Error('Use --input proofs.json --output receipt.json --mode dry|rehearsal|apply')
const {proofs}=JSON.parse(await readFile(input,'utf8'))
if(!Array.isArray(proofs)||proofs.length>250)throw Error('Bounded source proof export required')
let token=process.env.SUPABASE_PAT
if(!token){
 const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()
 token=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString('utf8'):raw
}
const template=await readFile(new URL('./reconcile-corroborated-city-lifecycle.sql',import.meta.url),'utf8')
const report={started_at:new Date().toISOString(),mode,proofs:proofs.length,receipts:[],complete:false}
await writeFile(output,JSON.stringify(report,null,2))
for(let i=0;i<proofs.length;i+=20){
 const chunk=proofs.slice(i,i+20)
 const literal=JSON.stringify(chunk).replaceAll("'","''")
 let query=template.replace('do $repair$',`select set_config('matching.city_classification_proofs','${literal}',true);\ndo $repair$`)
 if(mode!=='dry')query=query.replace('dry_run boolean:=true','dry_run boolean:=false')
 if(mode==='rehearsal')query=query.replace(/commit;\s*$/,'rollback;')
 const receipt={offset:i,ids:chunk.map(p=>p.id),status:'sending'}
 report.receipts.push(receipt);await writeFile(output,JSON.stringify(report,null,2))
 const response=await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query',{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query}),signal:AbortSignal.timeout(90000),
 })
 if(!response.ok){
  receipt.status='failed_or_unknown';receipt.http_status=response.status
  const diagnostic=await response.json().catch(()=>({}))
  receipt.error=String(diagnostic.message??diagnostic.error??'Native query failed').slice(0,1000)
  await writeFile(output,JSON.stringify(report,null,2))
  throw Error(`Batch HTTP ${response.status}: ${receipt.error}`)
 }
 const data=await response.json()
 const result=data[0]?.result
 if(!result||typeof result.eligible!=='number'||result.dry_run!==(mode==='dry'))throw Error('Unexpected native receipt')
 receipt.status=mode==='rehearsal'?'rolled_back':'completed';receipt.result=result
 await writeFile(output,JSON.stringify(report,null,2))
 console.log(JSON.stringify({offset:i,mode,...result}))
}
report.complete=true;report.finished_at=new Date().toISOString()
await writeFile(output,JSON.stringify(report,null,2))
console.log(JSON.stringify({mode,eligible:report.receipts.reduce((n,r)=>n+r.result.eligible,0),
 committed:mode==='apply'?report.receipts.reduce((n,r)=>n+r.result.repaired,0):0,complete:true}))
