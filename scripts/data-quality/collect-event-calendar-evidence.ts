// Read-only confirmation of an occurrence's existing date from its publisher.
import { parseBkaSpielplan, parseLabOratory } from '../../supabase/functions/_shared/berlin-events-parse.ts'
import { decodeEntities, stripTags } from '../../supabase/functions/_shared/spartacus-parse.ts'

export type CalendarSource='bka-theater'|'lab-oratory'|'haz-ch'
export type CalendarEntry={source_key:string;title:string;start_date:string;url:string;performance_id?:string}
export type CalendarCandidate={finding_id:string;event_id:string;external_id:string;data_source:CalendarSource;title:string;source_title?:string;start_date:string;details:{page?:string};expected_event_hash:string;expected_finding_hash:string}
const clean=(value:unknown)=>decodeEntities(stripTags(String(value??''))).replace(/\s+/g,' ').trim()
const nameKey=(value:unknown)=>clean(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')

export function parseCalendarEvidence(source:CalendarSource,body:string):CalendarEntry[]{
 if(source==='bka-theater')return parseBkaSpielplan(body).flatMap(e=>e.startIso&&e.detailUrl?[{
  source_key:`${e.productionId}:${e.date}T${e.time}`,title:e.subtitle?`${e.title}: ${e.subtitle}`:e.title,
  start_date:e.startIso,url:e.detailUrl,performance_id:new URL(e.detailUrl).searchParams.get('tid')??e.tid,
 }]:[])
 if(source==='lab-oratory')return parseLabOratory(body).flatMap(e=>e.startIso?[{
  source_key:e.blockId??e.startLocal,title:e.title,start_date:e.startIso,
  url:e.slug?`https://www.lab-oratory.de/${e.slug}`:'https://www.lab-oratory.de/',
 }]:[])
 const data=JSON.parse(body)
 if(!Array.isArray(data.events))throw Error('Publisher response lacks an event array')
 return data.events.flatMap((e:Record<string,unknown>)=>{
  if(typeof e.slug!=='string'||typeof e.url!=='string'||typeof e.utc_start_date!=='string'
   ||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e.utc_start_date))return[]
  const date=new Date(e.utc_start_date.replace(' ','T')+'Z')
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19).replace('T',' ')!==e.utc_start_date)return[]
  return[{source_key:e.slug,title:clean(e.title),start_date:date.toISOString(),url:e.url}]
 })
}

export function calendarConfirmsCandidate(candidate:CalendarCandidate,entries:CalendarEntry[]){
 const matches=entries.filter(e=>e.source_key===candidate.external_id)
 if(matches.length!==1)return null
 const entry=matches[0]
 if(!Number.isFinite(Date.parse(entry.start_date))||Date.parse(entry.start_date)!==Date.parse(candidate.start_date))return null
 if(![candidate.title,candidate.source_title].some(title=>!!title&&nameKey(title)===nameKey(entry.title)))return null
 try{
  const page=new URL(candidate.details.page??''),source=new URL(entry.url)
  if(page.protocol!=='https:'||source.protocol!=='https:'||page.username||page.password||source.username||source.password)return null
  if(candidate.data_source==='bka-theater'){
   const pid=candidate.external_id.split(':')[0]
   const correctProduction=page.pathname==='/content_start.php'?page.searchParams.get('id')===pid:page.pathname===`/prg/${pid}`
   if(page.hostname!=='www.bka-theater.de'||source.hostname!=='www.bka-theater.de'||!correctProduction
    ||page.searchParams.get('tid')!==entry.performance_id)return null
  }else if(candidate.data_source==='lab-oratory'){
   if(page.hostname!=='www.lab-oratory.de'||source.hostname!==page.hostname
    ||page.pathname!=='/'&&page.pathname.replace(/\/$/,'')!==source.pathname.replace(/\/$/,''))return null
  }else if(page.hostname!=='haz.ch'||source.hostname!==page.hostname
   ||page.pathname.replace(/\/$/,'')!==source.pathname.replace(/\/$/,''))return null
 }catch{return null}
 return entry
}

const sha256=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('')
async function capture(source:CalendarSource,url:string){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'QueerGuide-CalendarEvidence/1.0 (https://queer.guide)'}})
 if(!response.ok||!response.body){await response.body?.cancel();throw Error(`Publisher unavailable: HTTP ${response.status}`)}
 const chunks:Uint8Array[]=[],reader=response.body.getReader();let size=0
 while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();throw Error('Oversized publisher response')};chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const body=new TextDecoder().decode(bytes)
 return{source,url,observed_at:new Date().toISOString(),sha256:await sha256(body),body}
}

if(import.meta.main){
 const[input,output]=Deno.args
 if(!input||!output)throw Error('Use candidates.json evidence.json')
 const candidates=JSON.parse(await Deno.readTextFile(input))as CalendarCandidate[]
 if(!Array.isArray(candidates)||candidates.length>250||candidates.some(c=>!['bka-theater','lab-oratory','haz-ch'].includes(c.data_source)))throw Error('Bounded publisher candidate export required')
 const captures:Awaited<ReturnType<typeof capture>>[]=[],entries=new Map<CalendarSource,Array<CalendarEntry&{capture_sha256:string}>>()
 for(const source of [...new Set(candidates.map(c=>c.data_source))]){
  const records:Array<CalendarEntry&{capture_sha256:string}>=[]
  for(let page=1;page<=(source==='haz-ch'?10:1);page++){
   const url=source==='bka-theater'?'https://www.bka-theater.de/spielplan/':source==='lab-oratory'?'https://www.lab-oratory.de/':`https://haz.ch/wp-json/tribe/events/v1/events?per_page=50&page=${page}`
   const result=await capture(source,url),parsed=parseCalendarEvidence(source,result.body)
   if(!parsed.length)throw Error('Publisher calendar yielded no dated events')
   captures.push(result);records.push(...parsed.map(entry=>({...entry,capture_sha256:result.sha256})))
   if(source==='haz-ch'&&page>=Number(JSON.parse(result.body).total_pages??1))break
  }
  entries.set(source,records)
 }
 const proofs=candidates.flatMap(candidate=>{
  const entry=calendarConfirmsCandidate(candidate,entries.get(candidate.data_source)??[])
  return entry?[{...candidate,verified_entry:entry,contract:'official_event_calendar.v1',human_reviewed:false}]:[]
 })
 const used=new Set(proofs.map(p=>(p.verified_entry as CalendarEntry&{capture_sha256:string}).capture_sha256))
 await Deno.writeTextFile(output,JSON.stringify({proofs,captures:captures.filter(c=>used.has(c.sha256))}))
 console.log(JSON.stringify({examined:candidates.length,confirmed:proofs.length,unconfirmed:candidates.length-proofs.length,captures:used.size}))
}
