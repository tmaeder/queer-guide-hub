// Bounded source capture for a publisher venue website + independently mapped
// official contact page. It supplies evidence, never edits native records.
import { parseSiegessaeuleDetail, berlinIso } from '../../supabase/functions/_shared/berlin-events-parse.ts'
import { distanceKm } from '../../supabase/functions/_shared/geo-link-guards.ts'

export function homepageHost(value: unknown): string | null {
  if (typeof value!=='string')return null
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&['/','/index.html'].includes(u.pathname)?u.hostname.toLowerCase().replace(/^www\./,''):null}catch{return null}
}
export function officialContactPoint(html: string) {
  const matches=[...html.matchAll(/new OpenLayers\.LonLat\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\)/g)]
  const points=matches.map(m=>({latitude:Number(m[2]),longitude:Number(m[1])}))
  if(points.some(p=>Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||(!p.latitude&&!p.longitude)))return null
  const unique=new Map(points.map(p=>[`${p.latitude},${p.longitude}`,p]));return unique.size===1?[...unique.values()][0]:null
}
const sha=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('')
if(import.meta.main){
 const[input,output,officialUrl]=Deno.args
 // This contact endpoint was checked independently against the publisher's
 // venue link. Extend the capture adapter with tests before adding a host.
 if(!input||!output||officialUrl!=='https://www.insomnia-berlin.de/kontakt.html')throw Error('Use candidates.json evidence.json https://www.insomnia-berlin.de/kontakt.html')
 const candidates=JSON.parse(await Deno.readTextFile(input))
 if(!Array.isArray(candidates)||candidates.length>50)throw Error('Bounded native candidate export required')
 const captures:Array<Record<string,unknown>>=[]
 async function capture(url:string){
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)})
  if(!response.ok||!response.body)throw Error(`Source HTTP ${response.status}`)
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>3000000){await reader.cancel();throw Error('Oversized source')};chunks.push(r.value)}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  const body=new TextDecoder().decode(bytes);const result={url,body,sha256:await sha(body),observed_at:new Date().toISOString()};captures.push(result);return result
 }
 const official=await capture(officialUrl),officialPoint=officialContactPoint(official.body)
 const officialText=official.body.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
 if(!officialPoint||!/^https:\/\/(?:www\.)?insomnia-berlin\.de\//.test(officialUrl)||!officialText.includes('12099'))throw Error('Official identity/address/map unavailable')
 const proofs=[];let refused=0
 for(const c of candidates){
  const sourceUrl=new URL(c.source_url)
  if(sourceUrl.protocol!=='https:'||sourceUrl.hostname!=='www.siegessaeule.de'||sourceUrl.username||sourceUrl.password||sourceUrl.port||sourceUrl.search||sourceUrl.hash||sourceUrl.href!==`https://www.siegessaeule.de/termine/${c.external_id}/`)throw Error('Unsupported publisher URL')
  const occurrence=/\/([0-9]{4}-[0-9]{2}-[0-9]{2})\/([0-9]{2}:[0-9]{2})\/$/.exec(sourceUrl.href)
  if(!occurrence||Date.parse(berlinIso(occurrence[1],occurrence[2])??'')!==Date.parse(c.start_date)){refused++;continue}
  const publisher=await capture(sourceUrl.href),d=parseSiegessaeuleDetail(publisher.body)
  const host=homepageHost(d.venueUrl),venuePoint={latitude:Number(c.venue_latitude),longitude:Number(c.venue_longitude)}
  const sourcePoint={latitude:d.venueLatitude,longitude:d.venueLongitude}
  const distances=[distanceKm(sourcePoint,venuePoint),distanceKm(officialPoint,venuePoint),distanceKm(sourcePoint,officialPoint)]
  if(d.title!==c.title||!d.venueName||!d.venueAddress||!host||host!==homepageHost(c.venue_website)||host!=='insomnia-berlin.de'||!/(^|\D)12099(\D|$)/.test(d.venueAddress)||distances.some(n=>n===null||n>0.1)){refused++;continue}
  proofs.push({...c,publisher_venue_name:d.venueName,publisher_venue_url:d.venueUrl,publisher_address:d.venueAddress,
   source_latitude:d.venueLatitude,source_longitude:d.venueLongitude,official_latitude:officialPoint.latitude,official_longitude:officialPoint.longitude,
   homepage_host:host,postal_code:'12099',publisher_capture:publisher.sha256,official_capture:official.sha256})
 }
 await Deno.writeTextFile(output,JSON.stringify({proofs,captures}))
 console.log(JSON.stringify({examined:candidates.length,proofs:proofs.length,refused,captures:captures.length}))
}
