import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { createCitySearchResolver } from './city-wikidata-match.ts'
const statement = (value: unknown, extra = {}) => ({ mainsnak: { snaktype: 'value', datavalue: { value } }, ...extra })
const claims = (lat = 35.47, lon = -97.52, klass = 'Q515', country = 'Q30') => ({
  P31: [statement({ id: klass })], P17: [statement({ id: country })], P625: [statement({ latitude: lat, longitude: lon })],
})
const input = { base: 'Oklahoma City', queries: ['Oklahoma City', 'Oklahoma City, United States'], countryCode: 'US', latitude: 35.47, longitude: -97.52 }
function fixture(search: Record<string, unknown>[], entities: Record<string, unknown>) {
  const calls: string[] = []
  const request = async (url: string) => {
    calls.push(url); const u = new URL(url)
    if (u.searchParams.get('action') === 'wbsearchentities') return { ok: true, data: { search } }
    const qs = u.searchParams.get('ids')!.split('|')
    return { ok: true, data: { entities: Object.fromEntries(qs.map(q => [q, entities[q] ?? { missing: '' }])) } }
  }
  return { request, calls }
}
const common = { Q515: { labels: { en: { value: 'city' } } }, Q30: { claims: { P297: [statement('US')] } }, Q16: { claims: { P297: [statement('CA')] } }, QTeam: { labels: { en: { value: 'basketball team' } } } }
Deno.test('a team mentioning the city cannot hide the actual city behind it', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City Thunder' }, { id: 'Q2', label: 'Oklahoma City' }], { ...common, Q2: { claims: claims() } })
  const r = await createCitySearchResolver(f.request, [])(input)
  assertEquals(r.qid, 'Q2'); assertEquals(r.kind, 'selected')
  assertEquals(f.calls.some(u => new URL(u).searchParams.get('ids')?.split('|').includes('Q1')), false)
})
Deno.test('a wrong class with an exact alias does not prevent checking the later candidate', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }, { id: 'Q2', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims(35.47, -97.52, 'Q3') }, Q2: { claims: claims() }, Q3: { labels: { en: { value: 'basketball team' } } } })
  assertEquals((await createCitySearchResolver(f.request, [])(input)).qid, 'Q2')
})
Deno.test('a distant namesake cannot hide a geographically corroborated one', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }, { id: 'Q2', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims(40, -70) }, Q2: { claims: claims() } })
  assertEquals((await createCitySearchResolver(f.request, [])(input)).qid, 'Q2')
})
Deno.test('two same-country nearby settlements remain ambiguous instead of selecting search rank', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }, { id: 'Q2', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims() }, Q2: { claims: claims(35.6, -97.5) } })
  const r = await createCitySearchResolver(f.request, [])(input)
  assertEquals(r.kind, 'ambiguous'); assertEquals(r.qid, null)
})
Deno.test('a nearby settlement across a country boundary is not accepted', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims(35.47, -97.52, 'Q515', 'Q16') } })
  assertEquals((await createCitySearchResolver(f.request, [])(input)).kind, 'no_match')
})
Deno.test('existing territory-parent equivalence is respected', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims() } })
  const r = await createCitySearchResolver(f.request, [{ child_code: 'VI', parent_code: 'US' }])({ ...input, countryCode: 'VI' })
  assertEquals(r.kind, 'selected')
})
Deno.test('missing coordinates or country evidence never become a positive match', async () => {
  for (const c of [{ ...claims(), P625: [] }, { ...claims(), P17: [] }]) {
    const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: c } })
    assertEquals((await createCitySearchResolver(f.request, [])(input)).kind, 'unresolved')
  }
})
Deno.test('a source outage cannot exhaust or choose among exact namesakes', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims() } })
  const r = createCitySearchResolver(async url => url.includes('props=labels') ? { ok: false } : f.request(url), [])
  await assertRejects(() => r(input), Error, 'wikidata_candidate_unavailable')
})
Deno.test('localized alias evidence works without broad substring name matching', async () => {
  const f = fixture([{ id: 'Q1', label: 'Cape Town', match: { text: 'Kapstadt' } }], { ...common, Q1: { claims: claims() } })
  assertEquals((await createCitySearchResolver(f.request, [])({ ...input, base: 'Kapstadt', queries: ['Kapstadt'] })).qid, 'Q1')
})
Deno.test('verified locality candidates retain the parent-registration path, without city adoption', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims(35.47, -97.52, 'Q3') }, Q3: { labels: { en: { value: 'quarter of a city' } } } })
  const r = await createCitySearchResolver(f.request, [])(input)
  assertEquals(r.kind, 'locality'); assertEquals(r.qid, 'Q1')
})
Deno.test('class and country evidence is batched and reused between cities', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims() } })
  const resolve = createCitySearchResolver(f.request, [])
  await resolve(input); await resolve(input)
  assertEquals(f.calls.filter(u => new URL(u).searchParams.get('ids') === 'Q515').length, 1)
  assertEquals(f.calls.filter(u => new URL(u).searchParams.get('ids') === 'Q30').length, 1)
})
Deno.test('the literal qualified name prevents adoption of a nearby different Washington', async () => {
  const f = fixture([{ id: 'Q1', label: 'Washington' }, { id: 'Q2', label: 'Washington, D.C.' }], {
    ...common, Q1: { claims: claims() }, Q2: { claims: claims(38.9, -77.03) },
  })
  const r = await createCitySearchResolver(f.request, [])({ ...input, base: 'Washington', originalName: 'Washington, D.C.', queries: ['Washington', 'Washington, D.C.'] })
  assertEquals(r.qid, null); assertEquals(r.kind, 'no_match')
  assertEquals(r.probes.map(p => p.qid), ['Q2'])
})
Deno.test('a partially corroborated exact namesake blocks choosing its fully readable neighbor', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }, { id: 'Q2', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims() }, Q2: { claims: { ...claims(), P17: [] } } })
  assertEquals((await createCitySearchResolver(f.request, [])(input)).kind, 'unresolved')
})
Deno.test('invalid, Null Island and non-Earth coordinates are not corroboration', async () => {
  for (const point of [{ latitude: 100, longitude: -97 }, { latitude: 0, longitude: 0 }, { latitude: 35.47, longitude: -97.52, globe: 'http://www.wikidata.org/entity/Q111' }]) {
    const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: { ...claims(), P625: [statement(point)] } } })
    assertEquals((await createCitySearchResolver(f.request, [])(input)).kind, 'unresolved')
  }
})
Deno.test('preferred source coordinates are used rather than the first historical value', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: { ...claims(), P625: [statement({ latitude: 40, longitude: -70 }),statement({ latitude: 35.47, longitude: -97.52 }, {rank:'preferred'})] } } })
  assertEquals((await createCitySearchResolver(f.request, [])(input)).kind, 'selected')
})
Deno.test('ended country claims cannot contradict a present country', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: { ...claims(), P17: [statement({id:'Q16'},{qualifiers:{P582:[{snaktype:'value',datavalue:{value:{time:'+1900-01-01T00:00:00Z'}}}]}}),statement({id:'Q30'})] } } })
  const r = await createCitySearchResolver(f.request, [])(input)
  assertEquals(r.kind, 'selected'); assertEquals(r.probes[0].country, 'agree')
})
Deno.test('the selected source entity is retained for facts and names without a second read', async () => {
  const f = fixture([{ id: 'Q1', label: 'Oklahoma City' }], { ...common, Q1: { claims: claims(), labels:{en:{value:'Oklahoma City'}},sitelinks:{enwiki:{title:'Oklahoma City'}} } })
  const r = await createCitySearchResolver(f.request, [])(input)
  assertEquals(r.entity?.enwikiTitle, 'Oklahoma City')
  assertEquals(r.entity?.names.some(n => n.alias==='Oklahoma City'),true)
  assertEquals(f.calls.filter(u=>new URL(u).searchParams.get('ids')==='Q1').length,1)
})
Deno.test('a city-state can be corroborated but a country class alone cannot', async () => {
  for (const [labels, expected] of [[['city','sovereign state'],'selected'],[['sovereign state'],'no_match']] as const) {
    const f = fixture([{id:'Q1',label:'Singapore'}], {...common,Q1:{claims:{...claims(),P31:labels.map((_,i)=>statement({id:`Q${i+5}`}))}},...Object.fromEntries(labels.map((value,i)=>[`Q${i+5}`,{labels:{en:{value}}}]))})
    assertEquals((await createCitySearchResolver(f.request,[])({...input,base:'Singapore',queries:['Singapore']})).kind,expected)
  }
})
Deno.test('empty success differs from malformed and unavailable source responses', async () => {
  assertEquals((await createCitySearchResolver(async()=>({ok:true,data:{search:[]}}),[])(input)).kind,'no_match')
  for(const response of [{ok:false},{ok:true,data:{}},{ok:true,data:{error:{code:'maxlag'}}},{ok:true,data:{search:[{id:'Q1'}]}}]) {
    await assertRejects(()=>createCitySearchResolver(async()=>response,[])(input))
  }
})

Deno.test('a nearby island or country literal cannot be replaced by a city alias inside it', async () => {
  for (const label of ['island', 'sovereign state', 'geographic region']) {
    const f = fixture([{id:'Q1',label:'Gran Canaria'}, {id:'Q2',label:'Las Palmas de Gran Canaria',match:{text:'Gran Canaria'}}], {
      ...common, Q1:{claims:claims(35.47,-97.52,'Q3')}, Q2:{claims:claims()}, Q3:{labels:{en:{value:label}}},
    })
    const r = await createCitySearchResolver(f.request,[])({...input,base:'Gran Canaria',queries:['Gran Canaria']})
    assertEquals(r.kind,'unresolved'); assertEquals(r.qid,null)
  }
})
Deno.test('candidate entity reads respect the anonymous fifty-ID batch limit', async () => {
  const search = Array.from({length:51},(_,i)=>({id:`Q${i+100}`,label:'Oklahoma City'}))
  const f = fixture(search,{...common,...Object.fromEntries(search.map(({id})=>[id,{claims:claims()}]))})
  assertEquals((await createCitySearchResolver(f.request,[])(input)).kind,'ambiguous')
  assertEquals(f.calls.filter(u=>new URL(u).searchParams.get('props')==='claims|sitelinks|labels|aliases').map(u=>new URL(u).searchParams.get('ids')!.split('|').length),[50,1])
})
Deno.test('a city whose own label is the name is not blocked by a same-named region nearby', async () => {
  const f = fixture([{id:'Q84',label:'London'}, {id:'Q2',label:'London'}], {
    ...common, Q84:{claims:claims()}, Q2:{claims:claims(35.5,-97.5,'Q3')}, Q3:{labels:{en:{value:'region of England'}}},
  })
  const r = await createCitySearchResolver(f.request,[])({...input,base:'London',queries:['London']})
  assertEquals(r.kind,'selected'); assertEquals(r.qid,'Q84')
})
Deno.test('a "Name, Country" alias admits the candidate, and corroboration still decides', async () => {
  for (const [point, expected] of [[claims(), 'selected'], [claims(40, -70), 'no_match']] as const) {
    const f = fixture([{id:'Q1449',label:'Genoa',match:{text:'Genova, Italy'}}], {...common, Q1449:{claims:point}})
    const r = await createCitySearchResolver(f.request,[])({...input,base:'Genova',queries:['Genova']})
    assertEquals(r.kind, expected)
  }
})

const correctedDutchCountry = {
  P297: [statement('NL', { rank: 'deprecated', qualifiers: { P8327: [{ snaktype: 'value', datavalue: { value: { id: 'Q29999' } } }] } })],
  P17: [statement({ id: 'Q29999' })],
}
const dutchInput = { ...input, countryCode: 'NL' }
function dutchFixture(country = correctedDutchCountry, target = { P297: [statement('NL')] }, extraCountries: string[] = []) {
  return fixture([{ id: 'Q1', label: input.base }], {
    ...common, Q1: { claims: { ...claims(35.47, -97.52, 'Q515', 'Q55'), P17: ['Q55', ...extraCountries].map(id => statement({ id })) } },
    Q55: { claims: country }, Q29999: { claims: target },
  })
}
Deno.test('explicit intended-subject correction requires current matching parent ISO evidence', async () => {
  const f = dutchFixture()
  const resolve = createCitySearchResolver(f.request, [])
  const r = await resolve(dutchInput)
  assertEquals(r.kind, 'selected')
  assertEquals(r.probes[0].countryCorrections, [{ countryQid: 'Q55', intendedSubjectQid: 'Q29999', code: 'NL' }])
  await resolve(dutchInput)
  assertEquals(f.calls.filter(u => new URL(u).searchParams.get('ids') === 'Q29999').length, 1)
})
Deno.test('deprecated ISO alone or unrelated ambiguous parent never establishes country', async () => {
  const cases = [
    { ...correctedDutchCountry, P297: [statement('NL', { rank: 'deprecated' })] },
    { ...correctedDutchCountry, P17: [] },
    { ...correctedDutchCountry, P17: [statement({ id: 'Q30' })] },
    { ...correctedDutchCountry, P131: [statement({ id: 'Q30' })] },
    { ...correctedDutchCountry, P17: [statement({ id: 'Q29999' }, { rank: 'deprecated' })] },
    { ...correctedDutchCountry, P17: [statement({ id: 'Q29999' }, { qualifiers: { P580: [{ snaktype: 'value', datavalue: { value: { time: '+2999-01-01T00:00:00Z' } } }] } })] },
    { ...correctedDutchCountry, P17: [statement({ id: 'Q29999' }, { qualifiers: { P582: [{ snaktype: 'value', datavalue: { value: { time: '+1900-01-01T00:00:00Z' } } }] } })] },
  ]
  for (const country of cases) {
    const f = dutchFixture(country)
    assertEquals((await createCitySearchResolver(f.request, [])(dutchInput)).kind, 'unresolved')
  }
})
Deno.test('correction target must have unambiguous current unscoped matching ISO', async () => {
  for (const target of [
    { P297: [] }, { P297: [statement('NL', { rank: 'deprecated' })] },
    { P297: [statement('US')] }, { P297: [statement('NL'), statement('US')] },
    { P297: [statement('NL', { qualifiers: { P518: [{ snaktype: 'value', datavalue: { value: { id: 'Q1' } } }] } })] },
    { P297: [statement('NL', { qualifiers: { P580: [{ snaktype: 'value', datavalue: { value: { time: '+2999-01-01T00:00:00Z' } } }] } })] },
  ]) {
    const f = dutchFixture(correctedDutchCountry, target)
    assertEquals((await createCitySearchResolver(f.request, [])(dutchInput)).kind, 'unresolved')
  }
})
Deno.test('correction cannot hide another foreign or unknown current country', async () => {
  for (const [qid, verdict] of [['Q30', 'disagree'], ['Q999', 'unknown']]) {
    const f = dutchFixture(correctedDutchCountry, { P297: [statement('NL')] }, [qid])
    const r = await createCitySearchResolver(f.request, [])(dutchInput)
    assertEquals(r.probes[0].country, verdict)
    assertEquals(r.qid, null)
  }
})
Deno.test('a current direct ISO needs no correction fetch', async () => {
  const f = dutchFixture({ ...correctedDutchCountry, P297: [statement('NL')] })
  assertEquals((await createCitySearchResolver(f.request, [])(dutchInput)).kind, 'selected')
  assertEquals(f.calls.some(u => new URL(u).searchParams.get('ids') === 'Q29999'), false)
})
Deno.test('correction target outage remains retryable and cannot become no-match', async () => {
  const f = dutchFixture()
  const resolve = createCitySearchResolver(url => new URL(url).searchParams.get('ids') === 'Q29999' ? Promise.resolve({ ok: false }) : f.request(url), [])
  await assertRejects(() => resolve(dutchInput), Error, 'wikidata_candidate_unavailable')
})
