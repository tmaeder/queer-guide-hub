import { readStagedNewsInput } from '../pipeline-quality-enhance/staging-input.ts'
import { cleanTitle } from '../_shared/news-quality/sanitize.ts'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { decodeBytes } from '../_shared/decode-charset.ts'

export const SOURCE_RECOVERY_CONTRACT='news_source_text_recovery.v1'
const titleKey=(s:string)=>cleanTitle(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')

export function recoveryPageTitle(html:string){
 const $=cheerio.load(html)
 return ($('meta[property="og:title"]').first().attr('content')||$('title').first().text()).trim().slice(0,1000)||null
}

export async function fetchRecoveryHtml(rawUrl:string,request:typeof fetch=fetch):Promise<string|null>{
 try{
  let url=assertPublicHttpUrl(rawUrl)
  const signal=AbortSignal.timeout(8000)
  for(let redirect=0;redirect<=3;redirect++){
   if(url.username||url.password)return null
   const response=await request(url,{redirect:'manual',signal,headers:{Accept:'text/html,application/xhtml+xml'}})
   if(response.status>=300&&response.status<400){
    const location=response.headers.get('location');await response.body?.cancel()
    if(!location)return null
    url=assertPublicHttpUrl(new URL(location,url).href);continue
   }
   const type=response.headers.get('content-type')??''
   if(!response.ok||!/text\/html|application\/xhtml/i.test(type)||!response.body){await response.body?.cancel();return null}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
   while(true){const{done,value}=await reader.read();if(done)break;size+=value.length
    if(size>3000000){await reader.cancel();return null}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
   return decodeBytes(bytes,type).text
  }
 }catch{/* The source remains unverified; never substitute text on failure. */}
 return null
}

export function recoverySource(n:Record<string,unknown>){
 const input=readStagedNewsInput(n)
 const metadata=n.metadata&&typeof n.metadata==='object'?n.metadata as Record<string,unknown>:{}
 const candidates=[n.url,Array.isArray(n.urls)?n.urls[0]:null,metadata.url,n.source_url]
 const capturedUrl=input.url??candidates.find((v):v is string=>typeof v==='string'&&!!v.trim())?.trim()??''
 const mediaType=String(n.media_type||metadata.media_type||'article').trim().toLowerCase()
 const isArticle=['article','news','text'].includes(mediaType)&&![n.audio_url,metadata.audio_url].some(v=>typeof v==='string'&&!!v.trim())
 return {...input,capturedUrl,isArticle}
}

export function sourceRecoveryProposal<T extends Record<string,unknown>>(n:T,result:{body:string;markdown?:string|null;method:string;url:string;pageTitle?:string|null;at:string}){
 const source=recoverySource(n),body=result.body.trim()
 const titleMatches=!!result.pageTitle&&!!titleKey(source.title)&&titleKey(source.title)===titleKey(result.pageTitle)
 const gain=body.length>=280&&body.length<=100000&&body.length>source.content.length*1.2
 const applied=source.isArticle&&titleMatches&&gain
 return {...n,...(applied&&result.markdown?{markdown:result.markdown}:{}),...(applied?{content:body}:{}),extraction_meta:{
  recovery_contract:SOURCE_RECOVERY_CONTRACT,url:result.url,method:result.method,run_at:result.at,
  original_length:source.content.length,extracted_length:body.length,has_markdown:!!result.markdown,applied,
  page_title:result.pageTitle??null,...(titleMatches?{matched_title:source.title}:{}),
  reason:applied?'source_text_recovered':!source.isArticle?'not_an_article':!titleMatches?'page_identity_unconfirmed':'no_material_source_gain',
 }}
}
