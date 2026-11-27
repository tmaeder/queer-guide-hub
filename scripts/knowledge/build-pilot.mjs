import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PILOT_COPY } from './pilot-copy.mjs';
import { ENTRY_SOURCES, SOURCES } from './pilot-sources.mjs';
const baseline = JSON.parse(await readFile('docs/knowledge/pilot-baseline.json','utf8'));
const portraits = JSON.parse(await readFile('docs/knowledge/portrait-candidates.json','utf8'));
const rights = JSON.parse(await readFile('docs/knowledge/portrait-rights.json','utf8'));
const groups = {
 identity:['bisexual','cisgender','genderqueer','transfeminine'],relationships:['solo-poly','non-binary-terms-of-endearment','single','chosen-family'],culture:['photography','camp','queer-community','pride-flag'],history:['asexual-studies','queer-pedagogy','critical-disability-theory','queer-musicology'],health:['testosterone-therapy','medical-transition','transdermal-testosterone','testosterone-enanthate'],
 literature:['audre-lorde','judith-butler'],science:['alan-turing','magnus-hirschfeld'],arts:['zanele-muholi','gilbert-baker'],activism:['bayard-rustin','harvey-milk'],organising:['sylvia-rivera','marsha-p-johnson'],
};
const visuals = {'bisexual':['attraction-dimensions'],'cisgender':['identity-expression-orientation'],'genderqueer':['identity-expression-orientation'],'transfeminine':['identity-expression-orientation'],'chosen-family':['chosen-family-network'],'solo-poly':['relationship-agreements'],'queer-community':['chosen-family-network'],'pride-flag':['queer-history-connections'],'magnus-hirschfeld':['queer-history-connections'],'marsha-p-johnson':['queer-history-connections'],'sylvia-rivera':['queer-history-connections']};
const entries = baseline.entries.map((row) => {
 const copy = PILOT_COPY[row.slug]; if (!copy) throw new Error(`Missing copy: ${row.slug}`);
 const profile = row.entity_type==='personalities';
 const portrait=portraits.find((p)=>p.slug===row.slug);
 const group=Object.keys(groups).find((key)=>groups[key].includes(row.slug));
 const sources=ENTRY_SOURCES[row.slug].map((key)=>SOURCES[key]);
 return {entity_type:row.entity_type,entity_id:row.id,name:row.name,slug:row.slug,pilot_group:group,base_hash:row.base_hash,base_snapshot:row.base_snapshot,
  reader_question:profile?`What did ${row.name} contribute, and how can I understand their work in context?`:`What does ${row.name.toLowerCase()} mean, and how does it matter in everyday queer life?`,
  format:profile?'profile':group==='health'?'guide':'explainer',source_urls:sources.map((s)=>s.url),sources,visual_ids:visuals[row.slug]??[],patch:{description:copy.description,[profile?'bio':'long_description']:copy.body},
  portrait: rights.find((p)=>p.slug===row.slug) ?? (portrait?{status:'unresolved',url:portrait.image_url,evidence:'Existing image; subject and rights require review.'}:null),
  exception:group==='health'?'Specialist review is required before publication.':profile?'Initial profile draft is below the 500–900 word target; expand only with additional checked evidence.':null,
 };
});
if (entries.length!==30 || entries.filter((e)=>e.entity_type==='unified_tags').length!==20) throw new Error('Invalid pilot coverage');
const manifest={name:'Knowledge quality · English pilot · 2026-11-27',captured_at:baseline.captured_at,policy_version:'knowledge-v1',selection_notes:'Shortest sourceable entries within five topic groups. Ambiguous stock labels (Middle, Strawberry, Tiger), unsupported microlabels and exact duplicate scope were excluded; original live baselines are frozen. Profile selection spans five fields and three continents, prioritising thin bodies and clear primary sources.',entries};
await mkdir('docs/knowledge/drafts',{recursive:true});
for (const entry of entries) {
 const body=entry.patch.bio??entry.patch.long_description;
 const md=`# ${entry.name}\n\nCandidate English draft · not approved or published.\n\n${entry.patch.description}\n\n${body.replace(/<h2>(.*?)<\/h2>/g,'\n## $1\n\n').replace(/<p>/g,'').replace(/<\/p>/g,'\n')}\n\n## Source candidates\n\n${entry.sources.map((s)=>`- [${s.title}](${s.url}) — ${s.publisher}. Supports: ${s.supports}`).join('\n')}\n\n${entry.exception??'Requires source retrieval, independent evaluation and editorial review.'}\n`;
 await writeFile(`docs/knowledge/drafts/${entry.slug}.md`,md);
}
await writeFile('docs/knowledge/pilot-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({entries:entries.length,words:entries.reduce((n,e)=>n+Object.values(e.patch).join(' ').replace(/<[^>]*>/g,' ').split(/\s+/).length,0),figures:6,publication:'drafts only'},null,2));
