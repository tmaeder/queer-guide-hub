import { nativeRedirectRequested, nativeAttributionConsent, nativeProblem, nativeResolution, nativeHandoffRequest, nativeHandoffDigest, newNativeHandoffToken, nativeHandoffResponse, NATIVE_HANDOFF_MARKER } from '../_shared/redirect-native-resolution.ts';
import { passwordPageBranding, redirectPasswordPage } from '../_shared/redirect-password-page.ts';
import { DOMAIN_HEALTH_PATH, hasDomainRelay, verifyDomainRelay } from "../_shared/redirect-domain-relay.ts";
import { socialPreviewAgent, presentationPage } from "../_shared/redirect-presentation.ts";
import { redirectClientIp } from "../_shared/redirect-relay.ts";
import { visitorMetadata } from "../_shared/redirect-visitor.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.50.5";
import { chooseLinkTarget, deviceFromAgent, policyErrors, validPublicTarget, verifyLinkPassword, type LinkPolicy, type PasswordHash } from "../_shared/link-policy.ts";

const responseHeaders = {"Cache-Control":"no-cache, no-store","X-Robots-Tag":"noindex","Referrer-Policy":"no-referrer","Vary":"Accept"};
function mergeQuery(target: string, mode: string, incoming: URLSearchParams, overrides: Record<string,string> | null, defaults: Record<string,string> | null) {
  const parsed=target.trim().startsWith("/") ? new URL(target,"https://queer.guide") : new URL(target);
  if (mode !== "DROP") {
    if (mode === "OVERRIDE") for (const [key,value] of Object.entries(overrides ?? {})) parsed.searchParams.set(key,value);
    for (const [key,value] of incoming) if (!parsed.searchParams.has(key)) parsed.searchParams.set(key,value);
    for (const [key,value] of Object.entries(defaults ?? {})) if (!parsed.searchParams.has(key)) parsed.searchParams.set(key,value);
  }
  return parsed.href;
}
async function postedPassword(req: Request) {
  if (!req.body || !req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return "";
  const reader=req.body.getReader(); let total=0; const chunks:Uint8Array[]=[];
  for (;;) {const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>4096){await reader.cancel();throw new Error("Password form is too large");}chunks.push(value);}
  const body=new Uint8Array(total);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  return new URLSearchParams(new TextDecoder().decode(body)).get("password") ?? "";
}
function cleanReferrer(value: string | null) {
  if (!value) return null;
  try {const url=new URL(value);url.searchParams.delete("pw");url.searchParams.delete("password");return url.href;}catch{return null;}
}

Deno.serve(async (req: Request) => {
  const head=req.method === "HEAD", native=nativeRedirectRequested(req), nativeConsent=nativeAttributionConsent(req);
  const page:typeof redirectPasswordPage=(...args)=>native?nativeProblem(args[0],args[4]??false):redirectPasswordPage(...args);
  if (!["GET","HEAD","POST"].includes(req.method)) return native ? nativeProblem(405,head) : new Response("Method not allowed",{status:405,headers:{...responseHeaders,Allow:"GET, HEAD, POST"}});
  const url=new URL(req.url), slug=url.searchParams.get("slug")?.toLowerCase().trim() ?? "";
  const branded=hasDomainRelay(req.headers);
  const relay=branded ? await verifyDomainRelay(req,Deno.env.get("REDIRECT_RELAY_SECRET")) : null;
  if (branded && !relay) return page(404,"Link not found","This short link does not exist.",false,head);
  const validSlug=/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug);
  if (!branded && !validSlug) return page(404,"Link not found","This short link does not exist.",false,head);
  let incoming=new URLSearchParams(url.searchParams.get("q") ?? "");
  if(native&&(url.searchParams.has("pw")||url.searchParams.has("password")||incoming.has("pw")||incoming.has("password")))return nativeProblem(400,head);
  let handoff:ReturnType<typeof nativeHandoffRequest>;
  try { handoff=nativeHandoffRequest(req,incoming); } catch { return page(400,"Invalid app handoff","Open a supported install or resume link.",false,head); }
  incoming.delete(NATIVE_HANDOFF_MARKER);
  if(handoff?.action==='resume'&&incoming.size)return nativeProblem(400,head);
  const handoffToken=handoff?.action==='create'?newNativeHandoffToken():handoff?.token;
  const handoffHash=handoffToken?await nativeHandoffDigest(handoffToken):null;
  let password=url.searchParams.get("pw") ?? incoming.get("pw") ?? "";
  const isQr=incoming.get("qg_qr") === "1";
  incoming.delete("qg_qr");incoming.delete("pw");incoming.delete("password");incoming.delete("qg_click_id");
  if (incoming.toString().length>8192) return page(400,"Invalid link","The query string is too long.",false,head);
  try {
    if (req.method === "POST") password=await postedPassword(req);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let domain: {id:string;hostname:string;rootUrl:string|null;notFoundUrl:string|null;expiredUrl:string|null;needsRouteRefresh?:boolean}|null=null;
    if (relay) {
      const {data,error}=await db.rpc("redirect_public_domain",{p_hostname:relay.hostname});
      if(error)return page(503,"Link unavailable","Please try again shortly.",false,head);
      if(!data)return page(404,"Link not found","This domain is unavailable.",false,head);
      domain=data;
      if(data.needsRouteRefresh && relay.path!==DOMAIN_HEALTH_PATH) {
        const {data:refreshed,error:refreshError}=await db.rpc("record_redirect_domain_route",{p_hostname:relay.hostname});
        if(refreshError || refreshed!==true)return page(503,"Link unavailable","Please try again shortly.",false,head);
      }
      if(relay.path===DOMAIN_HEALTH_PATH) {
        if(req.method!=="GET")return new Response(null,{status:405,headers:{...responseHeaders,Allow:"GET"}});
        const {data:recorded,error:recordError}=await db.rpc("record_redirect_domain_route",{p_hostname:relay.hostname});
        return new Response(JSON.stringify({ready:!recordError&&recorded===true,protocol:1}),{status:!recordError&&recorded===true?200:503,headers:{...responseHeaders,"Content-Type":"application/json"}});
      }
    }
    const fallback=async(target:string|null|undefined) => {
      if(handoff || !target || !validPublicTarget(target))return null;
      const parsed=target.trim().startsWith("/") ? new URL(target,"https://queer.guide") : new URL(target);
      const {data:managed,error}=await db.from("redirect_domains").select("id").eq("hostname",parsed.hostname).maybeSingle();
      if(error || managed?.id || ["queer.guide","www.queer.guide"].includes(parsed.hostname)&&parsed.pathname.startsWith("/go/"))return null;
      if(native){parsed.searchParams.delete('qg_click_id');return nativeResolution(domain?'https://'+domain.hostname+(relay?.path??'/'):'https://queer.guide/go/'+slug,parsed.href,302,'web',null,head);}
      return new Response(null,{status:302,headers:{...responseHeaders,Location:parsed.href}});
    };
    const rootRequest=!!domain && relay?.path==="/";
    if(!rootRequest&&!validSlug)return await fallback(domain?.notFoundUrl) ?? page(404,"Link not found","This short link does not exist.",false,head);
    const sourcePath=domain ? rootRequest ? "/" : "/"+slug : "/go/"+slug, sourceHost=domain?.hostname??"queer.guide";
    const {data:snapshot,error:lookupError}=handoff?.action==='resume'
      ? await db.rpc("redirect_native_handoff_context",{p_token_hash:handoffHash,p_app:handoff.app,p_hostname:sourceHost,p_path:sourcePath,p_consent:nativeConsent})
      : await db.rpc("redirect_resolution_snapshot",{p_hostname:sourceHost,p_slug:slug,p_root:rootRequest});
    if (lookupError) return page(503,"Link unavailable","Please try again shortly.",false,head);
    const link=snapshot?.link, settings=snapshot?.settings;
    if(rootRequest&&!link)return await fallback(domain?.rootUrl) ?? page(404,"Link not found","No destination is configured for this domain.",false,head);
    if (!link || !link.is_enabled || link.start_at && Date.parse(link.start_at)>Date.now()) return await fallback(domain?.notFoundUrl) ?? page(404,"Link not found","This link is unavailable.",false,head);
    if(typeof snapshot?.fingerprint!=="string"||!settings)return page(503,"Link unavailable","Please try again shortly.",false,head);
    if(handoff?.action==='resume')incoming=new URLSearchParams(snapshot.query??'');
    const policy:LinkPolicy={...(settings?.policy ?? {}),...(link.end_at ? {expires_at:link.end_at} : {}),...(!settings?.policy?.expired_target && domain?.expiredUrl ? {expired_target:domain.expiredUrl} : {})};
    if (policyErrors(policy).length || !validPublicTarget(link.target)) return page(503,"Link unavailable","The destination settings need attention.",false,head);
    const ip=relay?.ip ?? await redirectClientIp(req.headers,slug,Deno.env.get("REDIRECT_RELAY_SECRET"));
    const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip+(Deno.env.get("REDIRECT_IP_HASH_SALT") ?? "qg-redirect-salt-2026"))));
    const ipHash=Array.from(hash,(value)=>value.toString(16).padStart(2,"0")).join("");
    if(handoff) {
      const {data:retry,error:budgetError}=await db.rpc('redirect_report_budget',{p_bucket:'native-handoff:'+ipHash,p_limit:30,p_seconds:60});
      if(budgetError||!Number.isInteger(retry)||retry<0||retry>900)return nativeProblem(503,head);
      if(retry>0){const response=nativeProblem(429,head);response.headers.set('Retry-After',String(retry));return response;}
    }
    if (settings?.password_hash) {
      let branding = null;
      if (!head && !native) {
        try {
          const result = await db.rpc('redirect_password_branding_public', {p_link:link.id});
          if (!result.error) branding = passwordPageBranding(result.data,Deno.env.get('SUPABASE_URL')??'');
        } catch { /* Decoration must not prevent a usable password challenge. */ }
      }
      if (head || !password && req.method !== "POST") return page(401,"Protected link","Enter the password to open this link.",true,head,branding);
      const {data:retry,error:attemptError}=await db.rpc("reserve_redirect_password_attempt",{p_redirect_id:link.id,p_client_hash:ipHash});
      if(attemptError || !Number.isInteger(retry) || retry<0 || retry>900) return page(503,"Link unavailable","Please try again shortly.",false,head);
      if(retry>0) {
        const response=page(429,"Try again later","Too many password attempts. Please wait "+Math.ceil(retry/60)+" minute(s) before trying again.",false,head,branding);
        response.headers.set("Retry-After",String(retry));return response;
      }
      if(!await verifyLinkPassword(password,settings.password_hash as PasswordHash)) return page(401,"Protected link","That password was not accepted.",true,head,branding);
    }
    const country=req.headers.get("x-qg-visitor-country") || req.headers.get("cf-ipcountry");
    const words=crypto.getRandomValues(new Uint32Array(1));
    let stats=[];
    if (policy.experiment && Date.parse(policy.experiment.ends_at)<=Date.now() && !policy.experiment.completed_target) {
      const {data,error}=await db.rpc("redirect_variant_performance",{p_redirect_id:link.id});
      if(error)return page(503,"Link unavailable","Please try again shortly.",false,head);
      stats=data ?? [];
    }
    let bucket=words[0]/4294967296*100;
    if(handoff?.action==='resume'&&snapshot.variantId) {
      let threshold=0,found=false;
      for(const variant of policy.experiment?.variants??[]) {
        if(variant.id===snapshot.variantId){bucket=threshold+variant.weight/2;found=true;break;}
        threshold+=variant.weight;
      }
      if(!found)return nativeProblem(410,head);
    }
    const selected=chooseLinkTarget(link.target,policy,{device:deviceFromAgent(req.headers.get("user-agent") ?? ""),country,bucket},stats);
    if(handoff&&(selected.expired||policy.cloaked))return nativeProblem(410,head);
    if (selected.expired && !selected.target) return page(410,"Link expired","This link is no longer available.",false,head);
    if (!selected.target || !validPublicTarget(selected.target)) return page(503,"Link unavailable","The destination settings need attention.",false,head);
    let destination=mergeQuery(selected.target,link.query_mode,incoming,link.query_override,link.utm_defaults);
    const targetUrl=new URL(destination);
    targetUrl.searchParams.delete("qg_click_id"); destination=targetUrl.href;
    if (["queer.guide","www.queer.guide"].includes(targetUrl.hostname) && targetUrl.pathname.startsWith("/go/")) return page(508,"Link loop","This link points to another short link.",false,head);
    const {data:managedTarget,error:targetError}=await db.from("redirect_domains").select("id").eq("hostname",targetUrl.hostname).maybeSingle();
    if(targetError)return page(503,"Link unavailable","Please try again shortly.",false,head);
    if(managedTarget?.id)return page(508,"Link loop","This link points to another short link.",false,head);
    const redirectStatus=req.method==="POST"&&settings?.password_hash?303:selected.expired?302:link.status_code;
    const canonical=domain ? "https://"+domain.hostname+"/"+(rootRequest ? "" : slug) : "https://queer.guide/go/"+slug;
    if(!native&&!selected.expired&&policy.preview&&socialPreviewAgent(req.headers.get("user-agent")??"")) {
      if(link.click_limit!==null&&link.click_limit!==undefined&&link.click_count>=link.click_limit)return page(410,"Link unavailable","This link has reached its visit limit.",false,head);
      return presentationPage(policy.preview,canonical,destination,false,head);
    }
    if(policy.cloaked&&!selected.expired&&!destination.startsWith("https://"))return page(503,"Link unavailable","Framed destinations require HTTPS.",false,head);
    if(head&&!selected.expired&&link.click_limit!==null&&link.click_limit!==undefined&&link.click_count>=link.click_limit)return page(410,"Link unavailable","This link has reached its visit limit.",false,head);
    let attributionClickId:string|null=null, handoffExpires:string|undefined;
    if (!head && !selected.expired) {
      const visit={p_snapshot:snapshot.fingerprint,p_redirect_id:link.id,p_path:sourcePath,p_query:incoming.toString() || null,p_referer:cleanReferrer(req.headers.get("referer")),p_user_agent:req.headers.get("user-agent"),p_country:country,p_ip_hash:ipHash,p_status:redirectStatus,p_variant_id:selected.variantId,p_destination:destination,p_metadata:{...visitorMetadata(req,isQr),domain:sourceHost}};
      const {data:recorded,error}=handoff?.action==='create'
        ? await db.rpc('create_redirect_native_handoff',{...visit,p_token_hash:handoffHash,p_app:handoff.app,p_consent:nativeConsent})
        : handoff?.action==='resume'
          ? await db.rpc('consume_redirect_native_handoff',{p_token_hash:handoffHash,p_app:handoff.app,p_hostname:sourceHost,p_path:sourcePath,p_consent:nativeConsent,p_snapshot:snapshot.fingerprint,p_destination:destination,p_variant_id:selected.variantId})
          : await db.rpc('record_redirect_snapshot_visit',visit);
      const clickId=handoff?.action==='create'?recorded?.clickId:recorded;
      if(handoff?.action==='create'&&recorded)handoffExpires=recorded.expiresAt;
      if(error)return page(503,"Link unavailable","Please try again shortly.",false,head);
      if(!clickId)return page(410,"Link unavailable","This link has expired or reached its visit limit.",false,head);
      if(policy.track_conversions&&(!native||nativeConsent)){attributionClickId=clickId;targetUrl.searchParams.set("qg_click_id",clickId);destination=targetUrl.href;}
    }
    if(native){const response=nativeResolution(canonical,destination,redirectStatus,selected.expired||policy.cloaked?'web':'navigate',attributionClickId,head);if(handoff)nativeHandoffResponse(response.headers,handoff.action==='create'?handoffToken!:null,handoffExpires);return response;}
    if(policy.cloaked&&!selected.expired)return presentationPage(policy.preview,canonical,destination,true,head);
    return new Response(null,{status:redirectStatus,headers:{...responseHeaders,Location:destination}});
  } catch {return page(503,"Link unavailable","Please try again shortly.",false,head);}
});
