import {assertEquals,assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {discoverCityIdentities,unambiguousDiscovery,type DiscoveryCheckpoint} from '../../../scripts/data-quality/discover-city-classification-evidence.ts'
import {classificationEvidence, type collectClassificationEvidence} from '../../../scripts/data-quality/collect-city-classification-evidence.ts'

Deno.test('discovery accepts only one corroborated identity within two kilometres',()=>{
 const p=(id:string,wikidata_qid:string,distance_m:number)=>({id,wikidata_qid,distance_m})
 assertEquals(unambiguousDiscovery([
  p('one','Q1',1999),p('two','Q2',10),p('two','Q3',100),
  p('three','Q4',2001),p('four','Q5',NaN),
  p('five','Q6',10),p('five','Q6',10),
  p('negative','Q7',-1),p('infinite','Q8',Infinity),
 ]),[p('one','Q1',1999)])
})

const rows=(count:number)=>Array.from({length:count},(_,i)=>({id:`row${i}`,name:`City${i}`,wikidata_qid:null,latitude:50,longitude:8,country_code:'DE',expected_updated_at:'now',expected_fingerprint:'fingerprint',previous_classification:{status:'unresolved'}}))
const collect:typeof collectClassificationEvidence=async(candidates)=>{
 const statement=(value:unknown)=>({rank:'normal' as const,mainsnak:{snaktype:'value' as const,datavalue:{value}}})
 const c=candidates[0],e={id:c.wikidata_qid,labels:{en:{value:c.name}},claims:{P31:[statement({id:'Q515'})],P17:[statement({id:'Q183'})],P625:[statement({latitude:50,longitude:8,globe:'http://www.wikidata.org/entity/Q2'})]}}
 const proof=classificationEvidence(c,e,{Q515:{id:'Q515',labels:{en:{value:'city'}}}},{Q183:{id:'Q183',claims:{P297:[statement('DE')]}}})!
 return {proofs:[{...proof,observed_at:'now',entity_payload_sha256:'hash',entity_payload_text:JSON.stringify(e)}],captures:[{url:'https://www.wikidata.org/w/api.php',sha256:'hash'}],unresolved:candidates.length-1}
}
const found=()=>new Response(JSON.stringify({search:[{id:'Q123'}]}))

Deno.test('busy source retains completed evidence and explicitly defers unfinished rows',async()=>{
 const checkpoints:DiscoveryCheckpoint[]=[];let searches=0,collections=0
 await assertRejects(()=>discoverCityIdentities(rows(7),{
  fetch:async()=>++searches===6?new Response(JSON.stringify({error:{code:'cirrussearch-too-busy-error'}})):found(),
  collect:async candidates=>{collections++;return await collect(candidates)},
  checkpoint:async state=>{checkpoints.push(state)},
 }),Error,'cirrussearch-too-busy-error')
 assertEquals(searches,6);assertEquals(collections,1);assertEquals(checkpoints.length,2)
 assertEquals(checkpoints.map(s=>s.processed_rows),[5,5])
 assertEquals(checkpoints.map(s=>s.proofs.length),[1,1])
 assertEquals(checkpoints[1].searchCaptures.length,5)
 assertEquals(checkpoints[1].captures.length,1)
 assertEquals(checkpoints[1].deferred.map(r=>r.id),['row5','row6'])
 assertEquals(checkpoints[1].unresolved,6)
 assertEquals(checkpoints[1].interruption?.includes('too-busy'),true)
 assertEquals(checkpoints[0].interruption,null)
 assertEquals(checkpoints[1].proofs[0].identity_search?.sha256,checkpoints[1].searchCaptures[0].sha256)
})

Deno.test('collection failure checkpoints completed chunks without trusting partial current candidates',async()=>{
 const checkpoints:DiscoveryCheckpoint[]=[];let batches=0
 await assertRejects(()=>discoverCityIdentities(rows(7),{fetch:async()=>found(),collect:async candidates=>{if(++batches===2)throw Error('Source unavailable: HTTP 503');return await collect(candidates)},checkpoint:async state=>{checkpoints.push(state)}}),Error,'HTTP 503')
 assertEquals(checkpoints[1].processed_rows,5)
 assertEquals(checkpoints[1].proofs.length,1)
 assertEquals(checkpoints[1].searchCaptures.length,7)
 assertEquals(checkpoints[1].deferred.length,2)
})

Deno.test('completed discovery checkpoints every bounded chunk and keeps input guards',async()=>{
 const checkpoints:DiscoveryCheckpoint[]=[]
 const result=await discoverCityIdentities(rows(7),{fetch:async()=>found(),collect,checkpoint:async state=>{checkpoints.push(state)}})
 assertEquals(checkpoints.map(s=>s.processed_rows),[5,7])
 assertEquals(result.proofs.length,2);assertEquals(result.deferred,[]);assertEquals(result.interruption,null)
 assertEquals(checkpoints[0].proofs.length,1)
 await assertRejects(()=>discoverCityIdentities(rows(251)),Error,'Bounded missing-identity')
})
