import {UUID,boundedJson,tokenDigest} from './redirect-api.ts';
import {analyticsFilters} from './redirect-analytics.ts';
import {verifyLinkPassword,type PasswordHash} from './link-policy.ts';
import {redirectClientIp} from './redirect-relay.ts';
export function savedReportInput(value:unknown,create:boolean) {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Provide report fields');
 const body=value as Record<string,unknown>;
 if(!Object.keys(body).length||Object.keys(body).some(k=>!['name','filters','version','visibility'].includes(k)))throw new Error('Invalid report fields');
 if((create||body.name!==undefined)&&(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100))throw new Error('Report name must be 1–100 characters');
 if(!create&&(typeof body.version!=='string'||!UUID.test(body.version)))throw new Error('Reload the report before editing');
 if(create&&body.filters===undefined)throw new Error('Report filters are required');
 if(body.visibility!==undefined&&!['private','team'].includes(body.visibility as string))throw new Error('Invalid report visibility');
 const filters=body.filters!==undefined?analyticsFilters(body.filters):undefined;
 if(filters&&new TextEncoder().encode(JSON.stringify(filters)).length>32768)throw new Error('Report filters exceed 32 KB');
 return {...(body.visibility!==undefined?{visibility:body.visibility}:{}),...(body.name!==undefined?{name:(body.name as string).trim()}:{}),...(filters?{filters}:{}),...(!create?{version:body.version}:{})};
}
export function reportShareInput(value:unknown) {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Provide share settings');
 const body=value as Record<string,unknown>;
 if(Object.keys(body).some(k=>!['title','reportVersion','includeConversions','scopeMode','expiresAt','password','allowIndexing'].includes(k)))throw new Error('Invalid share fields');
 if(typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>100)throw new Error('Public title must be 1–100 characters');
 if(typeof body.reportVersion!=='string'||!UUID.test(body.reportVersion))throw new Error('Reload and review the report before sharing');
 if(body.includeConversions!==undefined&&typeof body.includeConversions!=='boolean')throw new Error('Invalid conversion sharing option');
 if(body.allowIndexing!==undefined&&typeof body.allowIndexing!=='boolean')throw new Error('Invalid search indexing option');
 if(body.allowIndexing===true&&body.password!==undefined)throw new Error('Password-protected dashboards cannot be indexed');
 if(body.scopeMode!==undefined&&!['snapshot','folder'].includes(body.scopeMode as string))throw new Error('Invalid share scope');
 if(body.expiresAt!==undefined&&body.expiresAt!==null&&(typeof body.expiresAt!=='string'||!Number.isFinite(Date.parse(body.expiresAt))||Date.parse(body.expiresAt)<=Date.now()||Date.parse(body.expiresAt)>Date.now()+366*86400000))throw new Error('Choose an expiry within one year or no expiry');
 if(body.password!==undefined&&(typeof body.password!=='string'||body.password.length<1||body.password.length>256))throw new Error('Password must be 1–256 characters');
 return {values:{allowIndexing:body.allowIndexing??false,title:body.title.trim(),reportVersion:body.reportVersion,includeConversions:body.includeConversions??false,scopeMode:body.scopeMode??'snapshot',expiresAt:body.expiresAt===null?null:body.expiresAt??new Date(Date.now()+30*86400000).toISOString()},password:body.password as string|undefined};
}
function record(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid report response');return value as Record<string,unknown>;}
function count(value:unknown):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid aggregate count');return value;}
const labelSets:Record<string,string[]>={device:['Desktop','Mobile','Tablet','Bot','Unknown'],browser:['Chrome','Safari','Firefox','Edge','Opera','Samsung Internet','Unknown'],os:['iOS','Android','Windows','macOS','Linux','Chrome OS','Unknown'],qr:['QR','Link']};
export function publicReportDates(value:unknown):Record<string,string> {
 const body=record(value),result:Record<string,string>={};
 if(Object.keys(body).some(k=>!['start','end'].includes(k)))throw new Error('Invalid public dates');
 for(const key of ['start','end'])if(key in body){
  const date=body[key];
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(date)||!Number.isFinite(Date.parse(date)))throw new Error('Invalid public dates');
  const normalized=new Date(date).toISOString();if(normalized.slice(0,10)!==date.slice(0,10))throw new Error('Invalid public dates');result[key]=normalized;
 }
 if(result.start&&result.end&&result.start>=result.end)throw new Error('Invalid public dates');
 return result;
}
function publicDateRange(value:unknown) {
 if(value===undefined)return undefined;
 const input=record(value),result:Record<'start'|'end'|'earliest'|'latest',string|null>={start:null,end:null,earliest:null,latest:null};
 for(const key of ['start','end','earliest','latest'] as const){const date=input[key];if(date===null)continue;if(typeof date!=='string'||!Number.isFinite(Date.parse(date)))throw new Error('Invalid public date range');result[key]=new Date(date).toISOString();}
 return result;
}
export function publicReportResult(value:unknown) {
 const root=record(value),report=record(root.report),totals=record(report.totals),conversions=root.includeConversions===true;
 if(typeof root.title!=='string'||root.title.length>100||!['hour','day','week','month'].includes(report.interval as string)||typeof report.snapshot!=='string'||!Number.isFinite(Date.parse(report.snapshot)))throw new Error('Invalid public report metadata');
 const resultTotals:Record<string,number>={clicks:count(totals.clicks)};
 if(conversions)for(const key of ['leads','sales','customers'])resultTotals[key]=count(totals[key]);
 if(!Array.isArray(report.series)||report.series.length>2000)throw new Error('Invalid aggregate series');
 const series=report.series.map(raw=>{const point=record(raw);if(typeof point.at!=='string'||!Number.isFinite(Date.parse(point.at)))throw new Error('Invalid series date');return {at:new Date(point.at).toISOString(),clicks:count(point.clicks),...(conversions?{leads:count(point.leads),sales:count(point.sales)}:{})};});
 const breakdowns:Record<string,{label:string;count:number}[]>={},rawBreakdowns=record(report.breakdowns);
 for(const dimension of ['country','device','browser','os','qr']) {
  const rows=rawBreakdowns[dimension]??[];if(!Array.isArray(rows)||rows.length>100)throw new Error('Invalid aggregate breakdown');
  const groups=new Map<string,number>();for(const raw of rows){const item=record(raw),label=typeof item.label==='string'&&(dimension==='country'?/^[A-Z]{2}$/.test(item.label):labelSets[dimension].includes(item.label))?item.label:'Unknown';groups.set(label,count((groups.get(label)??0)+count(item.count)));}
  breakdowns[dimension]=Array.from(groups,([label,n])=>({label,count:n})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 }
 const revenue:{currency:string;amount:string}[]=[];
 if(conversions){if(!Array.isArray(report.revenue)||report.revenue.length>200)throw new Error('Invalid revenue summary');for(const raw of report.revenue){const row=record(raw);if(typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency)||typeof row.amount!=='string'||!/^\d+(?:\.\d{1,6})?$/.test(row.amount))throw new Error('Invalid revenue amount');revenue.push({currency:row.currency,amount:row.amount});}}
 return {allowIndexing:root.allowIndexing===true,dateRange:publicDateRange(root.dateRange),title:root.title,includeConversions:conversions,linkCount:count(root.linkCount),scopeMode:root.scopeMode==='folder'?'folder':'snapshot',expiresAt:typeof root.expiresAt==='string'?root.expiresAt:null,report:{snapshot:new Date(report.snapshot).toISOString(),interval:report.interval as string,totals:resultTotals,revenue,series,breakdowns}};
}
export type PublicRedirectReport=ReturnType<typeof publicReportResult>;
export interface ReportDb {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>;}
export async function publicReportRequest(req:Request,db:ReportDb,secret:string,cors:Record<string,string>) {
 const json=(body:unknown,status=200,extra:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{...cors,Vary:[cors.Vary??cors.vary,'Authorization'].filter(Boolean).join(', '),'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',...extra}});
 if(!['GET','POST'].includes(req.method))return json({error:'Method not supported'},405);
 const id=req.headers.get('Authorization')?.match(/^Bearer qg_report_([a-f0-9-]{36})$/i)?.[1]?.toLowerCase();
 if(!id||!UUID.test(id))return json({error:'Dashboard unavailable'},404);
 if(new URL(req.url).search)return json({error:'Public dashboards do not accept filter overrides'},400);
 let password:string|undefined;let dates:Record<string,string>={};
 try {
  if(req.method==='POST'){
   const body=await boundedJson(req,4096);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['password','dates'].includes(k)))return json({error:'Provide only dashboard password and dates'},400);
   if(body.password!==undefined){if(typeof body.password!=='string'||!body.password||body.password.length>256)return json({error:'Provide a dashboard password'},400);password=body.password;}
   try{dates=publicReportDates(body.dates===undefined?{}:body.dates);}catch{return json({error:'Provide valid UTC start and end dates, with start before end'},400);}
  }
  const ip=await redirectClientIp(req.headers,'report:'+id,secret),clientHash=await tokenDigest(secret+':report:'+id+':'+ip);
  const check=await db.rpc('redirect_public_report_check',{p_id:id,p_client_hash:clientHash,p_password_attempt:password!==undefined});
  if(check.error)return json({error:check.error.code==='P0002'?'Dashboard unavailable':'Dashboard temporarily unavailable'},check.error.code==='P0002'?404:503);
  // `record()` is the file's existing narrowing helper and throws on a non-object,
  // which is the same shape `publicReportResult` already demands of the read below.
  const checkData=record(check.data);
  if(checkData.retryAfter)return json({error:'Please wait before refreshing or trying another password'},429,{'Retry-After':String(checkData.retryAfter)});
  let verified=false;
  if(checkData.passwordHash){if(!password)return json({error:'Password required',passwordRequired:true},401);verified=await verifyLinkPassword(password,checkData.passwordHash as PasswordHash);if(!verified)return json({error:'Incorrect password',passwordRequired:true},401);}
  const report=await db.rpc('redirect_public_report_read',{p_id:id,p_version:checkData.version,p_password_verified:verified,p_dates:dates});
  if(report.error&&['22023','22007','22008'].includes(report.error.code??''))return json({error:'Choose a shorter date range within the published reporting period, with start before end'},400);
  if(report.error)return json({error:report.error.code==='42501'?'Dashboard access changed; unlock again':'Dashboard unavailable',...(report.error.code==='42501'?{passwordRequired:true}:{})},report.error.code==='42501'?401:report.error.code==='P0002'?404:503);
  return json(publicReportResult(report.data));
 }catch(error){const invalid=error instanceof SyntaxError||error instanceof Error&&/Use application\/json|Missing request body|Request body exceeds/.test(error.message);return json({error:invalid?'Invalid dashboard request':'Dashboard temporarily unavailable'},invalid?400:503);}
}
