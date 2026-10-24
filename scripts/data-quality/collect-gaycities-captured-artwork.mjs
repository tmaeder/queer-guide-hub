#!/usr/bin/env node
// Positive image evidence from exact registered public archive URLs; no DB writes.
import sharp from 'sharp'
import {createHash}from'node:crypto'
import{readFile,writeFile,rename}from'node:fs/promises'
import{evaluateCover}from'../../supabase/functions/_shared/image-probe.ts'
const args=process.argv.slice(2),input=args[0],output=args[1],collect=args.includes('--collect')
if(!input||!output)throw Error('Provide native candidates and a fresh output path')
try{await readFile(output);throw Error('Fresh capture path required')}catch(e){if(e.code!=='ENOENT')throw e}
const rows=JSON.parse(await readFile(input,'utf8'))
if(!Array.isArray(rows)||rows.length>100)throw Error('At most one hundred native source candidates')
const allowed=/^https:\/\/gaycities-featured-images-production\.s3\.amazonaws\.com\/events\/(?:t\/sm\/|originals\/)[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/
if(rows.some(p=>!allowed.test(p.image_url)))throw Error('Only exact registered nested source artwork URLs')
if(!collect){console.log(JSON.stringify({read_only:true,candidates:rows.length,collect:false}));process.exit(0)}
const report={read_only:true,proofs:[],complete:false}
for(const row of rows){
 const p={...row,url:row.image_url,human_reviewed:false}
 try{
  const r=await fetch(p.url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'image/*','User-Agent':'QueerGuide-SourceArtworkAudit/1.0'}})
  const mime=(r.headers.get('content-type')??'').split(';')[0].toLowerCase()
  p.observed_at=new Date().toISOString()
  if(r.status!==200||!['image/jpeg','image/png','image/webp'].includes(mime)||!r.body)throw Error('Source did not return a supported image')
  const reader=r.body.getReader(),chunks=[];let bytes=0
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>4194304){await reader.cancel();throw Error('Source image exceeds capture bound')}chunks.push(part.value)}
  const b=Buffer.concat(chunks),m=await sharp(b,{limitInputPixels:40000000}).metadata()
  await sharp(b,{limitInputPixels:40000000}).stats() // Decode fully before accepting metadata.
  const reason=evaluateCover({width:m.width,height:m.height,bytes:b.length},'event_artwork')
  p.probe={passed:reason===null,status:200,mime_type:mime,sha256:createHash('sha256').update(b).digest('hex'),byte_size:b.length,width:m.width,height:m.height,reason}
 }catch(e){p.probe={passed:false,outcome_unknown:true,error:String(e.message).slice(0,200)}}
 report.proofs.push(p);await writeFile(output+'.tmp',JSON.stringify(report));await rename(output+'.tmp',output)
 if(report.proofs.length%5===0)console.log(JSON.stringify({processed:report.proofs.length,passed:report.proofs.filter(p=>p.probe.passed).length}))
}
report.complete=true;await writeFile(output+'.tmp',JSON.stringify(report));await rename(output+'.tmp',output)
console.log(JSON.stringify({processed:report.proofs.length,passed:report.proofs.filter(p=>p.probe.passed).length,complete:true}))
