import { sourceUrl } from '../review-automation/evidence.ts'
import type { Page } from './policy.ts'
export async function hash(text:string):Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('') }
export function plain(html:string):string {
  return html.replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<(style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|quot|#39|apos);/g,m=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&#39;':"'",'&apos;':"'"}[m]!)).replace(/\s+/g,' ').trim()
}
export function links(html:string,base:string):string[] {
  const urls=new Set<string>()
  for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label=plain(m[2]),path=m[1]
    if(!/2027|pride|parade|march|campsite|arena|village|party|ticket|news|event/i.test(`${label} ${path}`)||/202[0-6]|facebook|instagram|tiktok|twitter|x\.com|mailto:|login|sign.?in|register|privacy|\.pdf/i.test(path))continue
    try { const u=sourceUrl(new URL(path.replace(/&amp;/g,'&'),base).href);u.hash='';urls.add(u.href) } catch { /* Not a public document. */ }
  }
  return [...urls].slice(0,12)
}
export async function read(raw:string,referredBy?:string):Promise<{page:Page;links:string[]}> {
  let url=sourceUrl(raw),ref=referredBy
  const signal=AbortSignal.timeout(10000)
  for(let i=0;i<5;i++){
    const r=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':'QueerGuide-OfficialDateReview/1.0 (https://queer.guide)','Accept':'text/html,text/plain,application/ld+json'}})
    if(r.status>=300&&r.status<400){const next=r.headers.get('location');await r.body?.cancel();if(!next)throw Error('redirect_without_location');ref=url.href;url=sourceUrl(new URL(next,url).href);continue}
    if(!r.ok){await r.body?.cancel();throw Error(`source_http_${r.status}`)}
    if(!/text\/|application\/(?:ld\+)?json/i.test(r.headers.get('content-type')??'')){await r.body?.cancel();throw Error('source_not_readable')}
    if(!r.body)throw Error('source_empty')
    const reader=r.body.getReader(),decoder=new TextDecoder();let html='',size=0
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000)throw Error('source_too_large');html+=decoder.decode(value,{stream:true})}html+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
    const text=plain(html)
    if(text.length<100||/^(?:Just a moment|Access denied|Checking your browser)/i.test(text))throw Error('source_unreadable')
    // Never certify a silently truncated page.
    if(text.length>60000)throw Error('source_text_too_large')
    return {page:{url:url.href,referred_by:ref,retrieved_at:new Date().toISOString(),sha256:await hash(text),text},links:links(html,url.href)}
  }
  throw Error('source_too_many_redirects')
}
export async function collect(urls:readonly string[]) {
  const pages:Page[]=[],errors:{url:string;error:string}[]=[],seen=new Set<string>()
  const hosts=new Set(urls.map(u=>new URL(u).hostname.replace(/^www\./,'')))
  const ticketHosts=['fatsoma.com','eventbrite.com','eventbrite.co.uk','skiddle.com','ticketmaster.co.uk','ticketsource.co.uk','outsavvy.com','seetickets.com','dice.fm']
  let tasks=urls.map(url=>({url,ref:undefined as string|undefined}))
  for(let round=0;round<2;round++){
    const follow:{url:string;ref:string}[]=[]
    for(let n=0;n<tasks.length;n+=3){await Promise.all(tasks.slice(n,n+3).filter(t=>!seen.has(t.url)).map(async t=>{
      seen.add(t.url)
      try{const r=await read(t.url,t.ref);if(!pages.some(p=>p.url===r.page.url))pages.push(r.page);hosts.add(new URL(r.page.url).hostname.replace(/^www\./,''));for(const url of r.links){const host=new URL(url).hostname.replace(/^www\./,'');if(!seen.has(url)&&(hosts.has(host)||ticketHosts.some(h=>host===h||host.endsWith('.'+h))))follow.push({url,ref:r.page.url})}}
      catch(e){errors.push({url:t.url,error:e instanceof Error?e.message:'source_fetch_failed'})}
    }))}
    tasks=follow.sort((a,b)=>Number(/2027/.test(b.url))-Number(/2027/.test(a.url))).filter((t,i,a)=>a.findIndex(x=>x.url===t.url)===i).slice(0,6)
  }
  return {pages,errors,checked_at:new Date().toISOString()}
}
