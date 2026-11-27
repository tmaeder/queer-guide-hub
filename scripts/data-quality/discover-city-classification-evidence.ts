// Read-only identity discovery. Every candidate still passes the existing
// named settlement, country and coordinate evidence collector.
import { collectClassificationEvidence, type Candidate } from './collect-city-classification-evidence.ts'

type MissingIdentity = Omit<Candidate,'wikidata_qid'> & {wikidata_qid:null}
const hash=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('')

export function unambiguousDiscovery<T extends {id:string;wikidata_qid:string;distance_m:number}>(proofs:T[]){
 const groups=new Map<string,T[]>()
 for(const proof of proofs)groups.set(proof.id,[...(groups.get(proof.id)??[]),proof])
 // Do not prefer the closest of two plausible identities. Discovery uses a
 // tighter 2 km bound than confirmation of an already-linked identity.
 return [...groups.values()].filter(group=>group.length===1&&Number.isFinite(group[0].distance_m)&&group[0].distance_m>=0&&group[0].distance_m<=2000).map(group=>group[0])
}

type Collection = Awaited<ReturnType<typeof collectClassificationEvidence>>
type DiscoveryProof = Collection['proofs'][number] & {discovery_contract:string;previous_wikidata_qid:null;identity_search:Record<string,unknown>|undefined}
export type DiscoveryCheckpoint = {proofs:DiscoveryProof[];captures:Collection['captures'];searchCaptures:Record<string,unknown>[];processed_rows:number;unresolved:number;deferred:Array<{id:string;name:string;country_code:string}>;interruption:string|null}

export async function discoverCityIdentities(rows:MissingIdentity[],options:{fetch?:typeof fetch;collect?:typeof collectClassificationEvidence;checkpoint?:(state:DiscoveryCheckpoint)=>Promise<void>}={}){
 if(!Array.isArray(rows)||rows.length>250||rows.some(row=>row.wikidata_qid!==null))throw Error('Bounded missing-identity export required')
 const proofs:DiscoveryProof[]=[],captures:Collection['captures']=[],searchCaptures:Record<string,unknown>[]=[]
 let processed=0
 const snapshot=(interruption:string|null):DiscoveryCheckpoint=>structuredClone({proofs,captures,searchCaptures,processed_rows:processed,unresolved:rows.length-proofs.length,deferred:rows.slice(processed).map(({id,name,country_code})=>({id,name,country_code})),interruption})
 try{
 for(let offset=0;offset<rows.length;offset+=5){
  const candidates:Candidate[]=[],searches=new Map<string,Record<string,unknown>>()
  for(const row of rows.slice(offset,offset+5)){
   const url=new URL('https://www.wikidata.org/w/api.php')
   url.search=new URLSearchParams({action:'wbsearchentities',format:'json',language:'en',type:'item',limit:'50',search:row.name}).toString()
   const response=await (options.fetch??fetch)(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'QueerGuide-ClassificationEvidence/1.0 (https://queer.guide)'}})
   if(!response.ok)throw Error(`Identity source unavailable: HTTP ${response.status}`)
   const raw=await response.text()
   if(raw.length>200000)throw Error('Oversized identity search')
   const data=JSON.parse(raw)
   if(data.error||!Array.isArray(data.search))throw Error(`Incomplete identity search: ${String(data.error?.code??'missing-results').slice(0,80)} (${row.id})`)
   const capture={url:url.href,observed_at:new Date().toISOString(),sha256:await hash(raw),payload_text:raw}
   searchCaptures.push({id:row.id,...capture})
   // Incomplete search pages do not establish an unambiguous identity.
   if(data['search-continue']!==undefined||data.search.length>=50)continue
   const ids=[...new Set<string>(data.search.map((hit:{id:string})=>hit.id))]
   if(ids.some(qid=>!/^Q[1-9]\d*$/.test(qid)))throw Error('Invalid identity search result')
   searches.set(row.id,capture)
   for(const wikidata_qid of ids)candidates.push({...row,wikidata_qid})
  }
  const result=await (options.collect??collectClassificationEvidence)(candidates)
  captures.push(...result.captures)
  for(const proof of unambiguousDiscovery(result.proofs)){
   proofs.push({...proof,discovery_contract:'city_missing_identity.v1',previous_wikidata_qid:null,identity_search:searches.get(proof.id)})
  }
  processed=Math.min(offset+5,rows.length)
  await options.checkpoint?.(snapshot(null))
 }
 }catch(error){
  // A source failure is not an identity verdict. Retain only completed proof
  // batches and explicitly defer the current batch and all later input rows.
  await options.checkpoint?.(snapshot(String(error instanceof Error?error.message:error).slice(0,300)))
  throw error
 }
 return snapshot(null)
}

if(import.meta.main){
 const[input,output]=Deno.args
 if(!input||!output)throw Error('Usage: discover-city-classification-evidence candidates.json evidence.json')
 const rows=JSON.parse(await Deno.readTextFile(input))as MissingIdentity[]
 const checkpoint=async(state:DiscoveryCheckpoint)=>{
  // Atomic replacement prevents a partial JSON file if the process stops.
  await Deno.writeTextFile(`${output}.tmp`,JSON.stringify(state))
  await Deno.rename(`${output}.tmp`,output)
 }
 const result=await discoverCityIdentities(rows,{checkpoint})
 await checkpoint(result)
 console.log(JSON.stringify({examined:result.processed_rows,unambiguous_proofs:result.proofs.length,unresolved:result.unresolved,deferred:result.deferred.length}))
}
