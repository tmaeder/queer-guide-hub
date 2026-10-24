#!/usr/bin/env node
// Read-only native provider captures. No database facts, findings or source
// availability outcomes are written. Default is a preview with no API calls.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
const args=process.argv.slice(2),paths=args.filter(a=>!a.startsWith('--'))
if(paths.length!==2)throw Error('Usage: collector input.json output.json [--collect]')
const input=JSON.parse(await readFile(paths[0],'utf8'))
if(!Array.isArray(input)||input.length>100||input.some(r=>typeof r.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.id))||new Set(input.map(r=>r.id)).size!==input.length)throw Error('Up to 100 unique native venue UUIDs required')
if(!args.includes('--collect')){console.log(JSON.stringify({read_only:true,api_calls:input.length,collect:false}));process.exit(0)}
const project = 'xqeacpakadqfxjxjcewc'
let token = process.env.SUPABASE_PAT
if (!token) {
  let raw
  try { raw = execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim() }
  catch { throw new Error('Existing Supabase CLI account or SUPABASE_PAT required') }
  token = raw.startsWith('go-keyring-base64:') ? Buffer.from(raw.slice(18),'base64').toString('utf8') : raw
}
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query}),signal:AbortSignal.timeout(60_000),
  })
  if (!r.ok) throw new Error(`Management query failed (${r.status}); inspect native diagnostics`)
  return r.json()
}

try{await readFile(paths[1]);throw Error('Use a fresh capture journal path')}catch(error){if(error.code!=='ENOENT')throw error}
await mkdir(dirname(paths[1]),{recursive:true})
const report={started_at:new Date().toISOString(),read_only:true,ids:input.map(r=>r.id),receipts:[],captures:[],complete:false}
const save=async()=>{await writeFile(`${paths[1]}.tmp`,JSON.stringify(report,null,2));await rename(`${paths[1]}.tmp`,paths[1])}
await save()
for(let offset=0;offset<input.length;offset+=5){
 const ids=input.slice(offset,offset+5).map(r=>r.id),payload=JSON.stringify({mode:'contact_evidence',venue_ids:ids})
 const receipt={ids,status:'submitting',submitted_at:new Date().toISOString()};report.receipts.push(receipt);await save()
 let request
 try{request=await sql(`select public.automation_http_post(url:='https://${project}.supabase.co/functions/v1/enrich-venue',headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='legacy_anon_key'),'X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret'),'Content-Type','application/json'),body:='${payload}'::jsonb,timeout_milliseconds:=100000) request_id`)}catch(error){receipt.status='outcome_unknown';receipt.error=String(error.message).slice(0,300);await save();throw error}
 const rid=Number(request[0]?.request_id);if(!Number.isSafeInteger(rid))throw Error('Missing native request receipt')
 receipt.request_id=rid;receipt.status='waiting';await save()
 let response
 for(let poll=0;poll<40;poll++){await new Promise(r=>setTimeout(r,5000));const found=await sql(`select status_code,timed_out,content from net._http_response where id=${rid}`);if(found.length){response=found[0];break}}
 if(!response||response.timed_out||response.status_code!==200){receipt.status='outcome_unknown';receipt.http_status=response?.status_code;await save();throw Error(`Source capture ${rid} incomplete; inspect before continuing`)}
 const data=JSON.parse(response.content)
 if(!data.success||data.read_only!==true||!Array.isArray(data.captures))throw Error('Native evidence mode unavailable; no negative evidence recorded')
 receipt.status='completed';receipt.captured=data.captures.length;report.captures.push(...data.captures);await save()
 console.log(JSON.stringify({request_id:rid,processed:Math.min(offset+5,input.length),captured:report.captures.length,positive:report.captures.filter(c=>c.proof).length}))
}
report.complete=true;report.finished_at=new Date().toISOString();await save()
