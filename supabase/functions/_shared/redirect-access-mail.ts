import { cloudflareGatewayRequest } from './cloudflare-email-gateway.ts';
export interface AccessMailJob {
 id:string;leaseId:string;email:string;from:string;event:'requested'|'approved'|'denied';
}
export interface AccessMailDb {
 rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{message?:string}|null}>;
}
// Keep v1 text stable while queued jobs can retry under the same idempotency key.
export function accessMailPayload(job:AccessMailJob) {
 const review=job.event==='requested';
 const subject=review?'Link folder edit request':'Your link folder access request was '+job.event;
 const text=review?'An edit access request awaits your review in the Queer Guide link workspace.':'Your link folder access request has been '+job.event+'. Open the link workspace to see its current status.';
 const url='https://queer.guide/links-workspace?accessRequests='+(review?'review':'mine');
 return {from:job.from,to:[job.email],subject,text:text+'\n\n'+url,
  html:'<p>'+text+'</p><p><a href="'+url+'">Open link workspace</a></p>'};
}
export async function dispatchRedirectAccessMail(db:AccessMailDb,key:string,from:string,fetcher:typeof fetch=fetch,gatewayUrl:string='') {
 if(!key||!from||!gatewayUrl)return {configured:false,sent:0,failed:0,stale:0};
 const claimed=await db.rpc('claim_redirect_access_mail',{p_from:from,p_limit:5});
 if(claimed.error)throw new Error('Could not claim access notifications');
 if(!Array.isArray(claimed.data))throw new Error('Invalid notification claim');
 const counts={configured:true,sent:0,failed:0,stale:0};
 for(const job of claimed.data as AccessMailJob[]) {
  let providerId:string|null=null,error='Email delivery unavailable',retry=true,retryAfter:number|null=null;
  try {
   const response=await cloudflareGatewayRequest(accessMailPayload(job),'qg-redirect-access/'+job.id,key,gatewayUrl,fetcher);
   if(response.ok){const receipt=await response.json();if(typeof receipt.id==='string'&&receipt.id.length>0&&receipt.id.length<=200)providerId=receipt.id;}
   else {
    error='Email provider returned HTTP '+response.status;retry=response.status===408||response.status===409||response.status===429||response.status>=500;
    const raw=response.headers.get('Retry-After');if(raw){const number=Number(raw);retryAfter=Number.isFinite(number)?Math.min(82800,Math.max(0,Math.ceil(number))):Math.min(82800,Math.max(0,Math.ceil((Date.parse(raw)-Date.now())/1000)));if(!Number.isFinite(retryAfter))retryAfter=null;}
   }
  } catch { /* Network/timeout responses are ambiguous; retry with the same provider key. */ }
  const finished=await db.rpc('finish_redirect_access_mail',{p_id:job.id,p_lease:job.leaseId,p_provider_id:providerId,p_error:providerId?null:error,p_retry:retry,p_retry_after:retryAfter});
  if(finished.error)throw new Error('Could not acknowledge access notification');
  if(!finished.data)counts.stale++;else if(providerId)counts.sent++;else counts.failed++;
 }
 return counts;
}
