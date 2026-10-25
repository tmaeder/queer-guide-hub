/* eslint no-control-regex: "off" -- Rejecting ASCII control characters is intentional input/header validation. */
import { readVisitorGeo } from './redirect-visitor-geo.ts';
export function visitorAgent(agent: string | null) {
 const ua=(agent??'').slice(0,512);
 const isBot=/bot|spider|crawler|headless|facebookexternalhit|slurp|preview/i.test(ua);
 const device=!ua?'Unknown':isBot?'Bot':/iPad|Tablet|Android(?!.*Mobile)|Macintosh.*Mobile/i.test(ua)?'Tablet':/Mobile|iPhone|iPod|Android/i.test(ua)?'Mobile':'Desktop';
 const os=/iPhone|iPad|iPod|Macintosh.*Mobile/i.test(ua)?'iOS':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/CrOS/i.test(ua)?'Chrome OS':/Macintosh|Mac OS X/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Unknown';
 const browser=/Edg(?:e|A|iOS)?\//i.test(ua)?'Edge':/OPR\/|Opera/i.test(ua)?'Opera':/SamsungBrowser\//i.test(ua)?'Samsung Internet':/Chrome\/|CriOS\//i.test(ua)?'Chrome':/Firefox\/|FxiOS\//i.test(ua)?'Firefox':/Safari\//i.test(ua)?'Safari':'Unknown';
 return {device,os,browser,is_bot:isBot};
}
export function visitorMetadata(req: Request, isQr: boolean) {
 const clean=(name:string,max=128)=>{const value=req.headers.get(name);return value?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):null;};
 return {...visitorAgent(req.headers.get('user-agent')),city:readVisitorGeo(req.headers,'city'),region:readVisitorGeo(req.headers,'region'),continent:readVisitorGeo(req.headers,'continent'),domain:clean('x-qg-visitor-domain',253)??'queer.guide',is_qr:isQr};
}
