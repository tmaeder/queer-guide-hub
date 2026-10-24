#!/usr/bin/env node
import{readFile,writeFile}from'node:fs/promises'
import{createHash}from'node:crypto'
import{gayoutVenueEvidence}from'../../supabase/functions/_shared/gayout-venue-evidence.ts'
const[candidatesPath,capturesPath,output]=process.argv.slice(2)
if(!output)throw Error('Usage: prepare candidates.json captures.json proofs.json')
try{await readFile(output);throw Error('Use a fresh proof path')}catch(e){if(e.code!=='ENOENT')throw e}
const candidates=JSON.parse(await readFile(candidatesPath,'utf8')),capture=JSON.parse(await readFile(capturesPath,'utf8'))
if(!Array.isArray(candidates)||candidates.length>50||!Array.isArray(capture.captures))throw Error('At most fifty registered candidates and captures')
const proofs=[],unresolved=[]
for(const venue of candidates){
 const matches=capture.captures.filter(c=>c.source_url===venue.source_url&&c.final_url===venue.source_url&&c.http_status===200)
 if(matches.length!==1){unresolved.push({id:venue.id,reason:'missing_or_ambiguous_capture'});continue}
 const cap=matches[0],stamp=Date.parse(cap.observed_at)
 if(!Number.isFinite(stamp)||stamp<Date.now()-3600000||stamp>Date.now()+300000){unresolved.push({id:venue.id,reason:'stale_capture'});continue}
 const proof=gayoutVenueEvidence(venue,cap.source_excerpt)
 if(!proof){unresolved.push({id:venue.id,reason:'registered_identity_or_facts_not_corroborated'});continue}
 proofs.push({...venue,...proof,http_status:200,observed_at:cap.observed_at,scrape_id:cap.scrape_id,
  capture_kind:'selected_business_jsonld_fields',source_json_sha256:createHash('sha256').update(proof.source_json_text).digest('hex')})
}
await writeFile(output,JSON.stringify({proofs,unresolved},null,2))
console.log(JSON.stringify({output,proofs:proofs.length,unresolved:unresolved.length}))
