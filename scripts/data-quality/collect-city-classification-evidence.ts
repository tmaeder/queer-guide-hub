// Read-only captures. Reuse the existing settlement audit's classification rules.
import { classifyEvidence, normalizePlaceName } from './lib/city-settlement-audit.mjs'
import { CITY_NAME_LANGS, currentStatements, type Claims, type WdLabels, type WdAliases } from '../../supabase/functions/_shared/wikidata-city.ts'
import { distanceKm } from '../../supabase/functions/_shared/geo-link-guards.ts'

type Candidate = { id: string; name: string; wikidata_qid: string; latitude: number | string | null; longitude: number | string | null; country_code: string; expected_updated_at: string; expected_fingerprint: string; previous_classification: unknown }
type Entity = { id: string; claims?: Claims; labels?: WdLabels; aliases?: WdAliases; missing?: unknown }
const hash = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('')
const currentValues = (e: Entity, property: string) => {
 const live=currentStatements(e.claims?.[property]),preferred=live.filter(s=>s.rank==='preferred')
 return (preferred.length?preferred:live).map(s=>s.mainsnak?.datavalue?.value)
}
const refs=(e: Entity,p: string)=>currentValues(e,p).flatMap(v=>v&&typeof v==='object'&&'id'in v&&/^Q[1-9]\d*$/.test(String(v.id))?[String(v.id)]:[])
function decimalCoordinate(value: unknown): number | null {
 if(typeof value==='number')return Number.isFinite(value)?value:null
 if(typeof value!=='string'||! /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))return null
 const parsed=Number(value.trim())
 return Number.isFinite(parsed)?parsed:null
}
export function classificationEvidence(c: Candidate,e: Entity,classes: Record<string,Entity>,countries: Record<string,Entity>) {
 const latitude=decimalCoordinate(c.latitude),longitude=decimalCoordinate(c.longitude)
 if(e.id!==c.wikidata_qid||'missing'in e||!e.claims||!/^Q[1-9]\d*$/.test(e.id))return null
 // A present-day name and pin do not revive a dissolved municipality.
 if(currentValues(e,'P576').length)return null
 const names=[...Object.values(e.labels??{}).map(v=>v.value),...Object.values(e.aliases??{}).flat().map(v=>v.value)]
 if(!names.some(n=>normalizePlaceName(n)===normalizePlaceName(c.name)))return null
 const codes=refs(e,'P17').flatMap(id=>countries[id]?currentValues(countries[id],'P297'):[])
 if(!codes.includes(c.country_code)||!/^[A-Z]{2}$/.test(c.country_code))return null
 const points=currentValues(e,'P625').filter((v):v is {latitude:number;longitude:number;globe:string}=>!!v&&typeof v==='object'&&'latitude'in v&&'longitude'in v&&'globe'in v&&v.globe==='http://www.wikidata.org/entity/Q2'&&typeof v.latitude==='number'&&typeof v.longitude==='number')
 if(points.length!==1||latitude===null||longitude===null||Math.abs(latitude)>90||Math.abs(longitude)>180||(!latitude&&!longitude))return null
 const point=points[0]
 if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180||(!point.latitude&&!point.longitude))return null
 const distance=distanceKm({latitude,longitude},{latitude:point.latitude,longitude:point.longitude})
 if(distance===null||distance>10)return null
 const classIds=refs(e,'P31'),labels=classIds.map(id=>classes[id]?.labels?.en?.value)
 if(!classIds.length||labels.some(v=>!v))return null
 const verdict=classifyEvidence({classes:labels.filter((label):label is string=>!!label),description:'',geonames:[]})
 if(!['municipality','settlement'].includes(verdict.status))return null
 return {...c,latitude,longitude,status:verdict.status,reason:verdict.reason,classes:labels,class_ids:classIds,country_ids:refs(e,'P17'),source_latitude:point.latitude,source_longitude:point.longitude,distance_m:distance*1000,source_url:`https://www.wikidata.org/wiki/${e.id}`,human_reviewed:false}
}

if(import.meta.main){
 const [input,output]=Deno.args
 if(!input||!output)throw Error('Usage: collector candidates.json evidence.json')
 const rows=JSON.parse(await Deno.readTextFile(input))as Candidate[]
 if(!Array.isArray(rows)||rows.length>250||rows.some(c=>!/^Q[1-9]\d*$/.test(c.wikidata_qid)))throw Error('Bounded native candidate export required')
 const captures:Array<Record<string,unknown>>=[]
 async function read(ids:string[],props:string,languages='en',property?:string){
  const found:Record<string,Entity>={}
  const sizeLimit=property?1:25
  for(let i=0;i<ids.length;i+=sizeLimit){
   const chunk=ids.slice(i,i+sizeLimit),url=new URL('https://www.wikidata.org/w/api.php')
   url.search=new URLSearchParams(property?{action:'wbgetclaims',entity:chunk[0],property,format:'json'}:{action:'wbgetentities',ids:chunk.join('|'),props,languages,format:'json'}).toString()
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'QueerGuide-ClassificationEvidence/1.0 (https://queer.guide)'}})
   if(!response.ok||!response.body){await response.body?.cancel();throw Error(`Source unavailable: HTTP ${response.status}`)}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
   while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>8388608){await reader.cancel();throw Error('Oversized source response')};chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.length}
   const raw=new TextDecoder().decode(bytes),data=JSON.parse(raw)
   if(data.error||(property?!data.claims:!data.entities||chunk.some(id=>!data.entities[id])))throw Error('Incomplete source response')
   captures.push({url:url.href,observed_at:new Date().toISOString(),sha256:await hash(raw),ids:chunk})
   Object.assign(found,property?{[chunk[0]]:{id:chunk[0],claims:data.claims}}:data.entities)
  }
  return found
 }
 const entities=await read([...new Set(rows.map(c=>c.wikidata_qid))],'claims|labels|aliases',CITY_NAME_LANGS.join('|'))
 const classes=await read([...new Set(Object.values(entities).flatMap(e=>refs(e,'P31')))],'labels')
 const countries=await read([...new Set(Object.values(entities).flatMap(e=>refs(e,'P17')))],'claims','en','P297')
 const proofs=[];let unresolved=0
 for(const c of rows){const e=entities[c.wikidata_qid],proof=classificationEvidence(c,e,classes,countries);if(!proof){unresolved++;continue};proofs.push({...proof,observed_at:new Date().toISOString(),entity_payload_sha256:await hash(JSON.stringify(e)),entity_payload_text:JSON.stringify(e)})}
 await Deno.writeTextFile(output,JSON.stringify({proofs,captures,unresolved}))
 console.log(JSON.stringify({examined:rows.length,positive_proofs:proofs.length,unresolved,captures:captures.length}))
}
