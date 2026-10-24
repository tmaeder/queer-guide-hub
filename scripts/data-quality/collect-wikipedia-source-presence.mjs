#!/usr/bin/env node
// Official public API presence checks only; default preview, no database writes.
import{readFile,writeFile,rename,mkdir}from'node:fs/promises'
import{dirname}from'node:path'
import{createHash}from'node:crypto'
import{registeredWikipediaTitle,wikipediaPagePresence}from'../../supabase/functions/_shared/wikipedia-source-evidence.ts'
const args=process.argv.slice(2),input=args[0],output=args[1],collect=args.includes('--collect')
if(!input||!output)throw Error('Provide a bounded native candidate export and a fresh output path')
try{await readFile(output);throw Error('Fresh capture path required')}catch(e){if(e.code!=='ENOENT')throw e}
const rows=JSON.parse(await readFile(input,'utf8'))
if(!Array.isArray(rows)||rows.length>1000)throw Error('At most one thousand native source candidates')
const candidates=rows.map(row=>({...row,requested_title:registeredWikipediaTitle(row.source_url,row.source_entity_id)})).filter(row=>row.requested_title)
if(!collect){console.log(JSON.stringify({read_only:true,candidates:candidates.length,protected:rows.length-candidates.length,collect:false}));process.exit(0)}
const report={read_only:true,proofs:[],unresolved:[],complete:false},titles=[...new Set(candidates.map(row=>row.requested_title))]
await mkdir(dirname(output),{recursive:true})
const save=async()=>{await writeFile(output+'.tmp',JSON.stringify(report));await rename(output+'.tmp',output)}
await save()
for(let offset=0;offset<titles.length;offset+=20){
 const selected=titles.slice(offset,offset+20),url=new URL('https://en.wikipedia.org/w/api.php')
 for(const[k,v]of Object.entries({action:'query',format:'json',formatversion:'2',prop:'info|pageprops',inprop:'url',maxage:'0',smaxage:'0',maxlag:'5',titles:selected.join('|')}))url.searchParams.set(k,v)
 const r=await fetch(url,{redirect:'error',headers:{'User-Agent':'QueerGuide-SourceQuality/1.0 (+https://queer.guide)'},signal:AbortSignal.timeout(20000)})
 if(r.status!==200)throw Error('Source HTTP '+r.status+'; no absence inferred')
 const body=await r.text();if(body.length>2000000)throw Error('Oversized API response')
 const data=JSON.parse(body),observed_at=new Date().toISOString()
 if(data.error||!Array.isArray(data.query?.pages))throw Error('Official page presence response missing')
 for(const row of candidates.filter(row=>selected.includes(row.requested_title))){
  const matches=data.query.pages.map(page=>wikipediaPagePresence(row.requested_title,page)).filter(Boolean)
  if(matches.length!==1){report.unresolved.push({id:row.id,reason:'ambiguous_or_unknown_page_result'});continue}
  const selected_page_json=JSON.stringify(matches[0].page)
  report.proofs.push({...row,contract:'registered_wikipedia_page_presence:v1',human_reviewed:false,http_status:200,
   result:matches[0].result,observed_at,api_url:url.href,response_sha256:createHash('sha256').update(body).digest('hex'),
   selected_page_json,selected_page_sha256:createHash('sha256').update(selected_page_json).digest('hex')})
 }
 await save();console.log(JSON.stringify({examined:Math.min(offset+20,titles.length),missing:report.proofs.filter(p=>p.result==='missing').length,present:report.proofs.filter(p=>p.result==='present').length}))
 await new Promise(resolve=>setTimeout(resolve,300))
}
report.complete=true;await save()
