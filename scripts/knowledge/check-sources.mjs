import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { SOURCES } from './pilot-sources.mjs';
const selected=process.argv.slice(2);
const keys=selected.length?selected:Object.keys(SOURCES);
let receipts=[];
if(selected.length){try{receipts=JSON.parse(await readFile('docs/knowledge/source-receipts.json','utf8')).filter((r)=>!selected.some((k)=>SOURCES[k]?.id===r.id));}catch{}}
for(const key of keys)if(!SOURCES[key])throw new Error(`Unknown source ${key}`);
await mkdir('.tmp/knowledge-sources',{recursive:true});
for(let offset=0;offset<keys.length;offset+=5){
 const batch=await Promise.all(keys.slice(offset,offset+5).map(async(key)=>{
  const source=SOURCES[key];
  try{
   const response=await fetch(source.url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'queer.guide editorial research (https://queer.guide)'}});
   const raw=await response.text();const dom=new JSDOM(raw);const document=dom.window.document;document.querySelectorAll('script,style,nav,header,footer').forEach((node)=>node.remove());
   const title=document.title.trim();const text=(document.querySelector('main')?.textContent||document.querySelector('article')?.textContent||document.body.textContent).replace(/\s+/g,' ').trim();dom.window.close();
   const receipt={id:source.id,url:source.url,final_url:response.url,status:response.status,title,readable_characters:text.length,content_hash:createHash('sha256').update(text).digest('hex'),retrieved_at:new Date().toISOString(),review_state:'unreviewed',error:response.ok&&text.length>200?null:'Source unavailable, blocked, or insufficient readable text'};
   await writeFile(`.tmp/knowledge-sources/${key}.txt`,text);
   return receipt;
  }catch(error){return{id:source.id,url:source.url,retrieved_at:new Date().toISOString(),review_state:'unreviewed',error:error.message};}
 }));receipts.push(...batch);console.log(`Checked ${Math.min(offset+5,keys.length)}/${keys.length} sources`);
}
await writeFile('docs/knowledge/source-receipts.json',JSON.stringify(receipts,null,2)+'\n');
console.log(JSON.stringify({retrieved:receipts.filter((r)=>!r.error).length,blocked:receipts.filter((r)=>r.error).map((r)=>({id:r.id,status:r.status,error:r.error}))},null,2));
