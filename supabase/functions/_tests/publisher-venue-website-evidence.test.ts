import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { homepageHost, officialContactPoint } from '../../../scripts/data-quality/collect-publisher-venue-website-evidence.ts'

Deno.test('venue homepage comparison keeps exact host identity and only known homepage paths',()=>{
 assertEquals(homepageHost('https://www.insomnia-berlin.de/index.html'),'insomnia-berlin.de')
 assertEquals(homepageHost('https://insomnia-berlin.de/'),'insomnia-berlin.de')
 assertEquals(homepageHost('https://insomnia-berlin.de.evil.test/'),'insomnia-berlin.de.evil.test')
 for(const value of [null,{},'javascript:alert(1)','http://insomnia-berlin.de/','https://user:pass@insomnia-berlin.de/','https://insomnia-berlin.de:8443/','https://insomnia-berlin.de/branch','https://insomnia-berlin.de/?redirect=elsewhere','https://insomnia-berlin.de/#other'])assertEquals(homepageHost(value),null)
})
Deno.test('official map point reads explicit OpenLayers longitude/latitude without executing code',()=>{
 const html='<script>new OpenLayers.LonLat(13.38597, 52.46561);throw Error("never execute")</script>'
 assertEquals(officialContactPoint(html),{latitude:52.46561,longitude:13.38597})
 assertEquals(officialContactPoint(html+html),{latitude:52.46561,longitude:13.38597})
})
Deno.test('official maps refuse missing, competing or invalid coordinates',()=>{
 for(const html of ['', '52.46561 13.38597','new OpenLayers.LonLat(0,0)','new OpenLayers.LonLat(13,91)','new OpenLayers.LonLat(181,52)','new OpenLayers.LonLat(13,52);new OpenLayers.LonLat(14,53)'])assertEquals(officialContactPoint(html),null)
})
