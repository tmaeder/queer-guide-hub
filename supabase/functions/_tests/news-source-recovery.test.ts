import {assertEquals,assert}from'https://deno.land/std@0.168.0/testing/asserts.ts'
import {fetchRecoveryHtml,recoveryPageTitle,recoverySource,sourceRecoveryProposal}from'../pipeline-extract-fulltext/source-recovery.ts'
const n={title:'Community opens a new venue',content:'RSS stub',urls:['https://example.org/story'],metadata:{source_name:'Outlet'}}
const body='Actual article source paragraph. '.repeat(20)
const result={body,method:'worker:fetch',url:n.urls[0],pageTitle:n.title,at:'2026-10-25T18:00:00Z'}

Deno.test('source recovery requires a matching page title and materially more text',()=>{
 const p=sourceRecoveryProposal(n,result)
 assertEquals(p.content,body.trim());assert(p.extraction_meta.applied)
 assertEquals(p.extraction_meta.matched_title,n.title)
 assertEquals(p.metadata,n.metadata)
 assert(!('auto_publish'in p));assert(!('review_status'in p))
 for(const change of [{pageTitle:'Unrelated article'},{pageTitle:null},{body:'Still short'},{body:'x'.repeat(100001)}]){
  const refused=sourceRecoveryProposal(n,{...result,markdown:'Uncorroborated new markdown',...change})
  assertEquals(refused.content,n.content);assertEquals(refused.extraction_meta.applied,false)
  assert(!('markdown'in refused))
 }
})
Deno.test('source recovery keeps existing full source text when there is no material gain',()=>{
 const p=sourceRecoveryProposal({...n,content:body},result)
 assertEquals(p.content,body);assertEquals(p.extraction_meta.applied,false)
})
Deno.test('page title comparison permits publisher suffix and ordinary punctuation only',()=>{
 assert(sourceRecoveryProposal(n,{...result,pageTitle:n.title+' | Outlet'}).extraction_meta.applied)
 assertEquals(sourceRecoveryProposal(n,{...result,pageTitle:'Outlet home'}).extraction_meta.applied,false)
})
Deno.test('source recovery never offers private or credentialed URLs as fetch targets',()=>{
 for(const url of ['http://127.0.0.1/private','https://user:secret@example.org/private']){
  const input=recoverySource({...n,urls:[url]})
  assertEquals(input.url,undefined);assertEquals(input.capturedUrl,url)
 }
 assertEquals(recoverySource(n).url,n.urls[0])
})
Deno.test('fallback identity reads real document metadata rather than script text',()=>{
 assertEquals(recoveryPageTitle('<script>const fake="<title>Wrong</title>"</script><title>Actual &amp; current</title>'),'Actual & current')
 assertEquals(recoveryPageTitle('<meta property="og:title" content="Source title"><title>Fallback</title>'),'Source title')
 assertEquals(recoveryPageTitle('<article>No title</article>'),null)
})
Deno.test('recovery fallback refuses private redirects and never follows them automatically',async()=>{
 let calls=0
 const request:typeof fetch=(_url,options)=>{calls++;assertEquals(options?.redirect,'manual');return Promise.resolve(new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}))}
 assertEquals(await fetchRecoveryHtml('https://example.org/story',request),null);assertEquals(calls,1)
 assertEquals(await fetchRecoveryHtml('http://127.0.0.1/private',request),null);assertEquals(calls,1)
})
Deno.test('recovery fallback bounds source bytes and rejects non-HTML responses',async()=>{
 assertEquals(await fetchRecoveryHtml('https://example.org/story',()=>Promise.resolve(new Response('x'.repeat(3000001),{headers:{'content-type':'text/html'}}))),null)
 assertEquals(await fetchRecoveryHtml('https://example.org/story',()=>Promise.resolve(new Response('not HTML',{headers:{'content-type':'application/json'}}))),null)
})
