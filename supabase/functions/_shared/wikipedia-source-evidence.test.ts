import{deepStrictEqual as assertEquals}from'node:assert/strict'
import{registeredWikipediaTitle,wikipediaPagePresence}from'./wikipedia-source-evidence.ts'
Deno.test('registered title binds Unicode URL, stable source ID and country suffix',()=>{
 assertEquals(registeredWikipediaTitle('https://en.wikipedia.org/wiki/Piscine_R%C3%A9publique','wp:Piscine_République|France'),'Piscine République')
 assertEquals(registeredWikipediaTitle('https://en.wikipedia.org/wiki/Other','wp:Piscine_République|France'),null)
})
Deno.test('namespace, interwiki and section links cannot prove mainspace absence',()=>{
 for(const title of [':de:Place','Category:Place','Place#Beach','Place|Other'])assertEquals(registeredWikipediaTitle('https://en.wikipedia.org/wiki/'+encodeURIComponent(title),'wp:'+title),null)
})
Deno.test('only the exact public source origin and an unambiguous URL qualify',()=>{
 for(const url of ['https://en.wikipedia.org.evil.test/wiki/Place','http://en.wikipedia.org/wiki/Place','https://user@en.wikipedia.org/wiki/Place','https://en.wikipedia.org/wiki/Place?oldid=1','https://en.wikipedia.org/wiki/Place#Beach','https://en.wikipedia.org/wiki/%FF'])assertEquals(registeredWikipediaTitle(url,'wp:Place'),null)
})
Deno.test('a missing mainspace response is positive absence evidence',()=>{
 assertEquals(wikipediaPagePresence('Place',{title:'Place',ns:0,missing:true}),{result:'missing',page:{title:'Place',ns:0,missing:true}})
})
Deno.test('different, invalid and conflicting page records never establish absence',()=>{
 for(const page of [{title:'Other',ns:0,missing:true},{title:'Place',ns:14,missing:true},{title:'Place',ns:0,invalid:true,missing:true},{title:'Place',ns:0,missing:true,pageid:10},{title:'Place',ns:0}])assertEquals(wikipediaPagePresence('Place',page),null)
})
Deno.test('ordinary present and disambiguation pages invalidate a missing observation',()=>{
 for(const pageprops of [{},{disambiguation:''}])assertEquals(wikipediaPagePresence('Place',{title:'Place',ns:0,pageid:123,pageprops})?.result,'present')
})
Deno.test('title normalization is limited to the API first-letter rule',()=>{
 assertEquals(wikipediaPagePresence('place',{title:'Place',ns:0,missing:true})?.result,'missing')
 assertEquals(wikipediaPagePresence('Place Abc',{title:'Place ABC',ns:0,missing:true}),null)
})
