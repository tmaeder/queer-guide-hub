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

if(import.meta.main){
 const[input,output]=Deno.args
 if(!input||!output)throw Error('Usage: discover-city-classification-evidence candidates.json evidence.json')
 const rows=JSON.parse(await Deno.readTextFile(input))as MissingIdentity[]
 if(!Array.isArray(rows)||rows.length>250||rows.some(row=>row.wikidata_qid!==null))throw Error('Bounded missing-identity export required')
 const proofs:unknown[]=[],captures:unknown[]=[],searchCaptures:unknown[]=[]
 for(let offset=0;offset<rows.length;offset+=5){
  const candidates:Candidate[]=[],searches=new Map<string,Record<string,unknown>>()
  for(const row of rows.slice(offset,offset+5)){
   const url=new URL('https://www.wikidata.org/w/api.php')
   url.search=new URLSearchParams({action:'wbsearchentities',format:'json',language:'en',type:'item',limit:'50',search:row.name}).toString()
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'QueerGuide-ClassificationEvidence/1.0 (https://queer.guide)'}})
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
  const result=await collectClassificationEvidence(candidates)
  captures.push(...result.captures)
  for(const proof of unambiguousDiscovery(result.proofs)){
   proofs.push({...proof,discovery_contract:'city_missing_identity.v1',previous_wikidata_qid:null,identity_search:searches.get(proof.id)})
  }
 }
 await Deno.writeTextFile(output,JSON.stringify({proofs,captures,searchCaptures,unresolved:rows.length-proofs.length}))
 console.log(JSON.stringify({examined:rows.length,unambiguous_proofs:proofs.length,unresolved:rows.length-proofs.length}))
}
