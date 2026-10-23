// Probe only the larger artwork actually registered for these event identities.
// No application data writes, external search, or model calls.
import { sourceArtwork } from '../../supabase/functions/_shared/event-gap-core.ts'
import { readImageDimensions } from '../../supabase/functions/_shared/image-dimensions.ts'
import { evaluateCover } from '../../supabase/functions/_shared/image-probe.ts'

type Candidate = { id: string; title: string; images: string[]; updated_at: string; status: string; source_id: string; source_url: string; payload_hash: string; assets: unknown[]; image_provenance: unknown }
const [input,output]=Deno.args
if(!input||!output)throw Error('Usage: collector candidates.json evidence.json')
const rows=JSON.parse(await Deno.readTextFile(input))as Candidate[]
if(!Array.isArray(rows)||rows.length>100)throw Error('At most one hundred native candidates required')
const proofs:unknown[]=[],unresolved:Array<{id:string;attempts:Array<Record<string,unknown>>}>=[]
for(let offset=0;offset<rows.length;offset+=4){
 await Promise.all(rows.slice(offset,offset+4).map(async row=>{
  const candidates=sourceArtwork([{source_slug:'agendaq',source_url:row.source_url,raw:{assets:row.assets}}])
  const attempts:Array<Record<string,unknown>>=[]
  for(const candidate of candidates){
   if(candidate.url===row.images[0])continue
   const attempt:Record<string,unknown>={url:candidate.url};attempts.push(attempt)
   try{
    const response=await fetch(candidate.url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'image/*','User-Agent':'QueerGuide-CapturedArtwork/1.0'}})
    const mime=response.headers.get('content-type')?.split(';')[0].toLowerCase()
    attempt.http_status=response.status;attempt.mime_type=mime
    if(response.status!==200||!mime?.startsWith('image/')||!response.body){attempt.reason='unusable_http_response';await response.body?.cancel();continue}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0,complete=false
    try{
     while(true){const{done,value}=await reader.read();if(done){complete=true;break};total+=value.length;if(total>4194304)break;chunks.push(value)}
    }finally{await reader.cancel().catch(()=>{})}
    attempt.byte_size=total
    if(!complete||total<20000){attempt.reason=complete?'too_few_bytes':'oversized_response';continue}
    const bytes=new Uint8Array(total);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length}
    const dims=readImageDimensions(bytes)
    attempt.dimensions=dims
    const reason=dims?evaluateCover({width:dims.width,height:dims.height,bytes:total},'event_artwork'):'unknown_dimensions'
    if(reason){attempt.reason=reason;continue}
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')
    const asset=row.assets.find(a=>Array.isArray(a)&&typeof a[1]==='string'&&new URL(a[1],'https://data.agendaq.fr').href===candidate.url)
    if(!asset)continue
    proofs.push({...row,event_id:row.id,expected_updated_at:row.updated_at,url:candidate.url,asset,
     probe:{passed:true,status:200,mime_type:mime,byte_size:total,width:dims!.width,height:dims!.height,sha256:hash},
     observed_at:new Date().toISOString(),human_reviewed:false})
    return
   }catch(error){
    attempt.reason='fetch_unavailable'
    attempt.detail=String(error instanceof Error?error.cause??error.message:error).slice(0,300)
   }
  }
  unresolved.push({id:row.id,attempts})
 }))
}
await Deno.writeTextFile(output,JSON.stringify({proofs,unresolved,examined:rows.length}))
console.log(JSON.stringify({examined:rows.length,positive:proofs.length,unresolved:unresolved.length}))
