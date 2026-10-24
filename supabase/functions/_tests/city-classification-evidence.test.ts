import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { classificationEvidence } from '../../../scripts/data-quality/collect-city-classification-evidence.ts'
const statement=(value:unknown)=>({rank:'normal' as const,mainsnak:{snaktype:'value' as const,datavalue:{value}}})
const candidate={id:'test',name:'Example',wikidata_qid:'Q123',latitude:50,longitude:8,country_code:'DE',expected_updated_at:'now',expected_fingerprint:'fingerprint',previous_classification:{status:'unresolved'}}
const entity=()=>({id:'Q123',labels:{en:{value:'Example'}},claims:{P31:[statement({id:'Q515'})],P17:[statement({id:'Q183'})],P625:[statement({latitude:50,longitude:8,globe:'http://www.wikidata.org/entity/Q2'})]}})
const classes={Q515:{id:'Q515',labels:{en:{value:'city'}}}},countries={Q183:{id:'Q183',claims:{P297:[statement('DE')]}}}

Deno.test('classification captures require current name, country and coordinates alongside a positive class',()=>{
 const result=classificationEvidence(candidate,entity(),classes,countries)
 assertEquals(result?.status,'municipality')
 assertEquals(result?.human_reviewed,false)
 assertEquals(result?.source_url,'https://www.wikidata.org/wiki/Q123')
 assertEquals(classificationEvidence({...candidate,name:'Other'},entity(),classes,countries),null)
 assertEquals(classificationEvidence({...candidate,country_code:'FR'},entity(),classes,countries),null)
 assertEquals(classificationEvidence({...candidate,latitude:51},entity(),classes,countries),null)
 assertEquals(classificationEvidence({...candidate,latitude:NaN},entity(),classes,countries),null)
})

Deno.test('classification excludes uncertain classes, subdivisions, missing labels and ended claims',()=>{
 const source=entity()
 assertEquals(classificationEvidence(candidate,source,{},countries),null)
 assertEquals(classificationEvidence(candidate,source,{Q515:{id:'Q515',labels:{en:{value:'city district'}}}},countries),null)
 assertEquals(classificationEvidence(candidate,source,{Q515:{id:'Q515',labels:{en:{value:'island'}}}},countries),null)
 const ended={...source,claims:{...source.claims,P17:[{...statement({id:'Q183'}),qualifiers:{P582:[{snaktype:'novalue' as const}]}}]}}
 assertEquals(classificationEvidence(candidate,ended,classes,countries),null)
})

Deno.test('classification refuses conflicting points and identities and preserves settlement autonomy distinction',()=>{
 const source=entity()
 assertEquals(classificationEvidence(candidate,{...source,id:'Q999'},classes,countries),null)
 const points={...source,claims:{...source.claims,P625:[...source.claims.P625,...source.claims.P625]}}
 assertEquals(classificationEvidence(candidate,points,classes,countries),null)
 const village=classificationEvidence(candidate,source,{Q515:{id:'Q515',labels:{en:{value:'village'}}}},countries)
 assertEquals(village?.status,'settlement')
})

Deno.test('classification never revives a dissolved municipality from its remaining name and coordinates',()=>{
 const source=entity()
 assertEquals(classificationEvidence(candidate,{...source,claims:{...source.claims,P576:[statement({time:'+2020-01-01T00:00:00Z'})]}},classes,countries),null)
})

Deno.test('native PostgreSQL decimal coordinate strings retain strict identity evidence',()=>{
 const numeric=classificationEvidence(candidate,entity(),classes,countries)
 const decimal=classificationEvidence({...candidate,latitude:'50.00000000',longitude:'8.00000000'},entity(),classes,countries)
 assertEquals(decimal,numeric)
 for(const value of [null,undefined,'','   ','0x32','NaN','Infinity','50north',true,false,[],{},NaN,Infinity]){
  assertEquals(classificationEvidence({...candidate,latitude:value}as typeof candidate,entity(),classes,countries),null)
  assertEquals(classificationEvidence({...candidate,longitude:value}as typeof candidate,entity(),classes,countries),null)
 }
 assertEquals(classificationEvidence({...candidate,latitude:'91'},entity(),classes,countries),null)
 assertEquals(classificationEvidence({...candidate,longitude:'181'},entity(),classes,countries),null)
 assertEquals(classificationEvidence({...candidate,latitude:'0',longitude:'0'},entity(),classes,countries),null)
 const zeroAxis={...candidate,latitude:'0',longitude:'8'}
 const zeroEntity=entity();zeroEntity.claims.P625=[statement({latitude:0,longitude:8,globe:'http://www.wikidata.org/entity/Q2'})]
 assertEquals(classificationEvidence(zeroAxis,zeroEntity,classes,countries)?.status,'municipality')
})
