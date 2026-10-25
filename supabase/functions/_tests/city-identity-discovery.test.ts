import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {unambiguousDiscovery} from '../../../scripts/data-quality/discover-city-classification-evidence.ts'

Deno.test('discovery accepts only one corroborated identity within two kilometres',()=>{
 const p=(id:string,wikidata_qid:string,distance_m:number)=>({id,wikidata_qid,distance_m})
 assertEquals(unambiguousDiscovery([
  p('one','Q1',1999),p('two','Q2',10),p('two','Q3',100),
  p('three','Q4',2001),p('four','Q5',NaN),
  p('five','Q6',10),p('five','Q6',10),
  p('negative','Q7',-1),p('infinite','Q8',Infinity),
 ]),[p('one','Q1',1999)])
})
