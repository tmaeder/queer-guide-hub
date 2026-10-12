import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.114.0';
import { coordinateEvidence, ids, matchesName, values, type WikiEntity } from './evidence.ts';

const origins = new Set(['https://queer.guide','https://www.queer.guide','http://localhost:8080','http://localhost:5173']);
const headers = (req: Request) => ({ 'Content-Type':'application/json', 'Access-Control-Allow-Origin': origins.has(req.headers.get('origin') ?? '') ? req.headers.get('origin')! : '', 'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type', 'Access-Control-Allow-Methods':'POST,OPTIONS' });
async function wiki(url: string) {
  const response = await fetch(url,{headers:{'User-Agent':'QueerGuide-GeographyVerification/1.0 (https://queer.guide)'},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`Wikidata unavailable (${response.status}); retry later`);
  return response.json();
}
const entityCache = new Map<string, WikiEntity>();
async function entity(qid: string): Promise<WikiEntity> {
  if (!/^Q\d+$/.test(qid)) throw new Error('Invalid Wikidata identity');
  if (entityCache.has(qid)) return entityCache.get(qid)!;
  const data = await wiki(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const result = data.entities?.[qid];
  if (!result?.claims) throw new Error('Wikidata identity not found');
  // A bounded cache avoids repeated parent requests without growing indefinitely.
  if (entityCache.size > 200) entityCache.clear();
  entityCache.set(qid,result);
  return result;
}
async function ancestorMatches(start: WikiEntity, target: string | null) {
  if (!target) return false;
  let frontier = ids(start,'P131');
  const visited = new Set<string>([start.id]);
  for (let depth=0; depth<6 && frontier.length; depth++) {
    if (frontier.includes(target)) return true;
    const next: string[]=[];
    for (const id of frontier.slice(0,5)) {
      if (visited.has(id)) continue;
      visited.add(id); next.push(...ids(await entity(id),'P131'));
    }
    frontier=[...new Set(next)];
  }
  return false;
}
Deno.serve(async (req: Request) => {
  const reply = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:headers(req)});
  if (req.method==='OPTIONS') return new Response(null,{headers:headers(req)});
  if (req.method!=='POST') return reply({error:'Use POST'},405);
  try {
    const svc=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');
    if (!token) return reply({error:'Sign in to verify geography'},401);
    const {data:auth,error:authError}=await svc.auth.getUser(token);
    if(authError||!auth.user) return reply({error:'Invalid session'},401);
    const {data:roles,error:rolesError}=await svc.from('user_roles').select('role').eq('user_id',auth.user.id).in('role',['admin','moderator']);
    if(rolesError||!roles?.length) return reply({error:'Admin or moderator access required'},403);
    const {id}=await req.json();
    if(typeof id!=='string'||!/^[-0-9a-f]{36}$/i.test(id)) return reply({error:'A geographic record UUID is required'},400);
    const {data:record,error}=await svc.rpc('geo_cms_verify',{p_id:id});
    if(error||!record) return reply({error:error?.message ?? 'Record not found'},400);
    const fingerprint=record.verification.fingerprint;
    const checks={...record.verification.checks};
    const sources=[...record.verification.sources];
    const cityId=record.place_type==='city' ? id : record.city_id;
    const {data:city}=cityId ? await svc.from('cities').select('wikidata_qid').eq('id',cityId).maybeSingle() : {data:null};
    let qid=record.place_type==='city' ? city?.wikidata_qid : record.verification.checks.wikidata_qid;
    if(!qid) {
      const search=await wiki(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(record.name)}`);
      const matches: WikiEntity[]=[];
      for(const candidate of search.search ?? []) {
        const item=await entity(candidate.id);
        if(matchesName(item,record.name)) matches.push(item);
      }
      if(matches.length===1) qid=matches[0].id;
      else checks.reason=matches.length ? 'Ambiguous external place identity; choose a cited identity in review' : 'No exact external place identity found';
    }
    if(qid) {
      const item=await entity(qid);
      const countries=record.place_type==='country' ? [item.id] : ids(item,'P17');
      const codes=await Promise.all(countries.slice(0,5).map(async (countryId:string) => values(await entity(countryId),'P297')));
      const countryMatch=codes.flat().includes(record.country_code);
      const coords=coordinateEvidence(item,record.latitude,record.longitude,record.place_type==='village'?1000:10000);
      const parent=record.place_type==='village' ? await ancestorMatches(item,city?.wikidata_qid ?? null) : countryMatch;
      const queerStatements=(item.claims.P31 ?? []).filter((s) => s.rank!=='deprecated' && (s.mainsnak.datavalue?.value as {id?:string})?.id==='Q748198');
      Object.assign(checks,{wikidata_qid:qid,identity_verified:matchesName(item,record.name)&&countryMatch,
        coordinates_verified:record.place_type==='country' ? checks.country_match===true && countryMatch : coords.verified,
        country_match:checks.country_match===true && countryMatch,parent_verified:parent,
        external_distance_m:coords.distance,queer_designation_verified:record.place_type!=='village'||queerStatements.some((s)=>!!s.references?.length),
        reason:!countryMatch ? 'Wikidata country conflicts with the CMS relationship' : !coords.verified && record.place_type!=='country' ? coords.reason : !parent ? 'External administrative ancestry does not confirm the CMS parent' : record.place_type==='village'&&!queerStatements.some((s)=>!!s.references?.length) ? 'Geographic identity checked; queer designation still requires cited community or official evidence' : 'External geographic identity, country, coordinates and parent checked'});
      sources.push({title:`Wikidata ${qid}`,url:`https://www.wikidata.org/wiki/${qid}`,version:new Date().toISOString()});
    }
    const {error:writeError}=await svc.rpc('geo_cms_record_evidence',{p_id:id,p_fingerprint:fingerprint,p_checks:checks,p_sources:sources});
    if(writeError) return reply({error:writeError.message},409);
    const {data:result,error:readError}=await svc.rpc('geo_cms_record',{p_id:id});
    if(readError) throw readError;
    return reply(result);
  } catch(e) { return reply({error:e instanceof Error ? e.message : 'Verification failed; retry later'},503); }
});
