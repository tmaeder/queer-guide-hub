import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { spartacusContactEvidence, type Candidate } from '../../../scripts/data-quality/collect-spartacus-contact-evidence.ts'
const venue: Candidate = { venue_id:'venue',organization_id:'org',source_id:'source',source_entity_id:'123',expected_payload_hash:'a'.repeat(64),
  captured_url:'https://spartacus.gayguide.travel/goingout/germany/berlin/123_Fixture+Bar',name:'Fixture & Bar',latitude:52.5,longitude:13.4,country_code:'DE',city_id:'city',country_id:'country' }
const html = `<html><head><link rel="canonical" href="${venue.captured_url}"></head><body>
 <div class="entry hotel"><h1>Bars - <a href="${venue.captured_url}">Fixture &amp; Bar</a></h1><p>Source narrative.</p>
 <div class="one-third"><h2>Address</h2><p class="address">Fixture street</p><p><a href="https://fixture.example/">fixture.example</a></p></div>
 <div><script>L.marker([52.5, 13.4], {title:'Fixture'}).addTo(map)</script></div></div>
 <div><h1>Another place</h1><a href="https://advert.example/">Advertisement</a><script>L.marker([0,0])</script></div>
 </body></html>`
Deno.test('Spartacus contact capture confines identity and website to the exact physical entry', () => {
  const result=spartacusContactEvidence(venue,html)
  assertEquals(result?.website,'https://fixture.example/')
  assertEquals(result?.source_name,'Fixture & Bar')
  assertEquals(result?.source_latitude,52.5)
  assertEquals(spartacusContactEvidence({...venue,name:'Other'},html),null)
  assertEquals(spartacusContactEvidence({...venue,latitude:52.6},html),null)
  assertEquals(spartacusContactEvidence({...venue,latitude:Number.NaN},html),null)
})
Deno.test('Spartacus capture refuses redirected identities, duplicate entries and conflicting contact hosts', () => {
  assertEquals(spartacusContactEvidence(venue,html,venue.captured_url.replace('123_','124_')),null)
  assertEquals(spartacusContactEvidence(venue,html,venue.captured_url.replace('spartacus.gayguide.travel','evil.example')),null)
  assertEquals(spartacusContactEvidence(venue,html.replace('rel="canonical"','rel="alternate"')),null)
  assertEquals(spartacusContactEvidence(venue,html.replace('</body>','<div class="entry hotel"></div></body>')),null)
  assertEquals(spartacusContactEvidence(venue,html.replace('fixture.example</a>','fixture.example</a><a href="https://other.example/">Other</a>')),null)
  assertEquals(spartacusContactEvidence(venue,html.replace('https://fixture.example/','https://facebook.com/fixture')),null)
  assertEquals(spartacusContactEvidence(venue,html.replace('[52.5, 13.4]','[52.5, 13.4]);L.marker([52.5, 13.4]')),null)
})
