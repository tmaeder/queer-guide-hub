import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { canonicalLogoWebsite, publicLogoUrl, fetchLogoResource, logoIdentityMatches, officialLogoCandidates, inspectLogoBytes, safeLogoSvg, resolveQualityLogo, genericLogoAsset } from '../../supabase/functions/_shared/logo-quality.ts';
import { sameSiteOrCdn } from '../../supabase/functions/_shared/site-icon.ts';

function png(w,h,blank=false) {
  const chunk=(name,b)=>{const c=Buffer.alloc(b.length+12);c.writeUInt32BE(b.length);c.write(name,4);b.copy(c,8);return c;};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc((w*4+1)*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w*4+1)+1+x*4; const v=blank?255:((x+y)%2?20:240); raw[i]=raw[i+1]=raw[i+2]=v;raw[i+3]=255;}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const rules=[{value:'helloasso.com',match_mode:'suffix',class:'aggregator'},{value:'facebook',match_mode:'label',class:'social'},{value:'wordpress',match_mode:'label',class:'builder'}];
const noProvider=async()=>({outcome:'not_indexed',logo:null});

test('unwrap Google Translate and reject unsafe nested destinations',()=>{
 assert.equal(canonicalLogoWebsite('https://translate.google.com/website?u=https%3A%2F%2Fbarjedersicht.de%2F'), 'https://barjedersicht.de/');
 assert.equal(canonicalLogoWebsite('https://translate.google.com/website?u=http%3A%2F%2F127.0.0.1%2F'),null);
 for(const u of ['http://localhost/a','http://127.1/a','http://[::1]/','file:///tmp/a','https://a.internal/a','https://user:pass@valid.com/']) assert.equal(publicLogoUrl(u),false,u);
});
test('same public suffix is not proof of common ownership; customer CDNs remain supported',()=>{
 assert.equal(sameSiteOrCdn('https://wrong.co.uk/logo.png','https://correct.co.uk'),false);
 assert.equal(sameSiteOrCdn('https://static.wixstatic.com/media/customer.png','https://correct.co.uk'),true);
 assert.equal(genericLogoAsset('https://site.com/wp-includes/images/w-logo-blue.png'),true);
 assert.equal(genericLogoAsset('https://static.wixstatic.com/media/real-logo.png'),false);
});
test('identity matching needs meaningful entity evidence',()=>{
 assert.equal(logoIdentityMatches('Q Center','Welcome to Q Center'),true);
 assert.equal(logoIdentityMatches('Cafe Pride','The pride cafe'),false);
 assert.equal(logoIdentityMatches('Schüür','Konzerthaus Schuur Luzern'),true);
 assert.equal(logoIdentityMatches('Blue Bar','Blue Bar'),true);
});
test('JSON-LD publisher logos and foreign brands never earn automatic publication',()=>{
 const html='<title>Blue Bar</title><script type="application/ld+json">'+JSON.stringify({'@type':'WebPage',publisher:{'@type':'Organization',name:'Blue Bar',logo:'https://example.com/publisher.png'}})+'</script>';
 assert.equal(officialLogoCandidates(html,'Blue Bar','https://example.com/','https://example.com/').some(c=>c.automatic),false);
 const own='<script type="application/ld+json">'+JSON.stringify({'@type':'BarOrPub',name:'Blue Bar',url:'https://example.com',logo:'https://example.com/real.png'})+'</script>';
 assert.equal(officialLogoCandidates(own,'Blue Bar','https://example.com/','https://example.com/')[0].automatic,true);
});
test('only a real header logo plus the correct entity title earns automatic publication',()=>{
 const html='<title>Blue Bar</title><header><img class="logo" alt="Blue Bar logo" src="/logo.png"></header>';
 assert.equal(officialLogoCandidates(html,'Blue Bar','https://example.com/','https://example.com/')[0].automatic,true);
 assert.equal(officialLogoCandidates(html,'Other Bar','https://example.com/','https://example.com/')[0].automatic,false);
 const partner='<title>Blue Bar</title><header>hello</header><img class="logo" src="/partner.png">';
 assert.equal(officialLogoCandidates(partner,'Blue Bar','https://example.com/','https://example.com/').some(c=>c.automatic),false);
});
test('measure actual bytes; reject thumbnails, strips, blanks, malformed files and SVG scripts',async()=>{
 assert.equal((await inspectLogoBytes({bytes:png(128,128),contentType:'image/png'})).reason,'low_resolution');
 assert.equal((await inspectLogoBytes({bytes:png(512,512),contentType:'image/png'})).valid,true);
 assert.equal((await inspectLogoBytes({bytes:png(512,512,true),contentType:'image/png'})).reason,'blank_or_tiny_mark');
 assert.equal((await inspectLogoBytes({bytes:png(512,16),contentType:'image/png'})).valid,false);
 assert.equal((await inspectLogoBytes({bytes:Buffer.alloc(200),contentType:'image/png'})).valid,false);
 assert.equal(safeLogoSvg(Buffer.from('<svg><script>alert(1)</script></svg>')),false);
 assert.equal(safeLogoSvg(Buffer.from('<svg><path onload="evil()"/></svg>')),false);
 assert.equal(safeLogoSvg(Buffer.from('<svg><path d="M1 1 L2 2"/></svg>')),true);
});
test('platform pages are rejected before fetching their platform mark',async()=>{
 let providerCalls=0;
 const r=await resolveQualityLogo('Blue Bar','https://helloasso.com/associations/blue-bar',rules,new Set(),async()=>{providerCalls++;return noProvider();});
 assert.equal(r.reason,'platform_aggregator');assert.equal(providerCalls,0);
});
test('official identity wins; domain-provider results remain review-only',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async url=>String(url).endsWith('/logo.png') ? new Response(png(512,512),{headers:{'content-type':'image/png'}}) : new Response('<title>Blue Bar</title><header><img class="logo" alt="Blue Bar logo" src="/logo.png"></header>',{headers:{'content-type':'text/html'}});
  const official=await resolveQualityLogo('Blue Bar','https://example.com/',rules,new Set(),noProvider);
  assert.equal(official.candidate.automatic,true);
  globalThis.fetch=async()=>new Response('<title>Other Website</title>',{headers:{'content-type':'text/html'}});
  const provider=await resolveQualityLogo('Blue Bar','https://example.com/',rules,new Set(),async()=>({outcome:'found',logo:{bytes:png(512,512),contentType:'image/png'}}));
  assert.equal(provider.candidate.automatic,false);
 } finally { globalThis.fetch=original; }
});
test('cross-site redirects cannot bless a sibling company logo',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://facebook.com/blue'}});
  const r=await resolveQualityLogo('Blue Bar','https://example.com/',rules,new Set(),noProvider);
  assert.equal(r.candidate,null);
 } finally { globalThis.fetch=original; }
});

test('a directory page title cannot authorize the directory masthead as the event logo',()=>{
 const html='<title>Christmas Avenue | Berlin.de</title><header><img class="logo" alt="Berlin" src="/berlin-logo.png"></header>';
 assert.equal(officialLogoCandidates(html,'Christmas Avenue','https://berlin.de/events/christmas','https://berlin.de/events/christmas').some(c=>c.automatic),false);
});

test('prefer a real responsive original over a thumbnail or lazy-loading pixel',()=>{
 const html='<title>Blue Bar</title><header><img class="logo" alt="Blue Bar" src="data:image/gif;base64,AAAA" data-src="/thumb.png" srcset="/thumb.png 128w, /original.png?x=1&amp;y=2 1024w"></header>';
 const c=officialLogoCandidates(html,'Blue Bar','https://example.com/','https://example.com/')[0];
 assert.equal(c.url,'https://example.com/original.png?x=1&y=2');assert.equal(c.automatic,true);
});

test('a share-card thumbnail mislabeled as a JSON-LD logo is not automatically published',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Organization',name:'Blue Bar',url:'https://example.com',logo:'https://example.com/assets/default_thumb-123.jpg'})+'</script>';
 assert.equal(officialLogoCandidates(html,'Blue Bar','https://example.com/','https://example.com/').some(c=>c.automatic),false);
});

test('SVG checks reject namespaced script, encoded external links and external stylesheet instructions',()=>{
 for(const s of ['<svg><s:script>alert(1)</s:script></svg>','<svg><feImage href="https://example.com/pixel"/></svg>','<svg><a href="java&#x73;cript:evil()"><path/></a></svg>','<?xml-stylesheet href="https://example.com/style"?><svg><path/></svg>']) assert.equal(safeLogoSvg(Buffer.from(s)),false);
 assert.equal(safeLogoSvg(Buffer.from('<svg><defs><linearGradient id="a"/></defs><path fill="url(&quot;#a&quot;)"/></svg>')),false);
 assert.equal(safeLogoSvg(Buffer.from('<svg><defs><linearGradient id="a"/></defs><path fill="url(#a)"/></svg>')),true);
});

test('read a bounded HTML prefix from a large homepage; oversized images remain rejected',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response('<title>Blue Bar</title>'+'.'.repeat(1000),{headers:{'content-type':'text/html','content-length':'1023'}});
  const page=await fetchLogoResource('https://example.com',100,'text/html');
  assert.equal(page.bytes.length,100);assert.match(new TextDecoder().decode(page.bytes),/Blue Bar/);
  assert.equal(await fetchLogoResource('https://example.com',100,'image/*'),null);
 } finally {globalThis.fetch=original;}
});
