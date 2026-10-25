import { redirectWorkspaceSelection } from '../_shared/redirect-workspace.ts';
import {domainInstructionMailConfig,instructionMailInput,dispatchDomainInstructionMail} from '../_shared/redirect-domain-mail.ts';
import { domainConnectConfig, domainConnectInput, runDomainConnectAction } from '../_shared/redirect-domain-connect-api.ts';
import { nativeAppValues, publicAppAssociation } from '../_shared/redirect-native-apps.ts';
import { inventoryQuery, inventoryOperations, redirectInventoryManifest } from '../_shared/redirect-inventory-api.ts';
import {passwordBrandingInput,storePasswordLogo} from '../_shared/redirect-password-branding.ts';
import {createWebhookSecret,webhookInput,webhookVersionInput,webhookPage} from '../_shared/redirect-webhooks.ts';
import {customerId,customerProfileInput,customerPage} from '../_shared/redirect-customers.ts';
import {createQrImageToken,qrImageLinkInput,qrImageRevokeInput,qrImageUrls,publicQrImageRequest,storeQrImageArtwork} from '../_shared/redirect-qr-images.ts';
import {qrAssetStorageConfig,qrLogoInput,storeRedirectQrLogo,qrLogoPublicResponse} from '../_shared/redirect-qr-assets.ts';
import {qrStylePreferenceInput} from '../_shared/redirect-qr-style.ts';
import {manualRedirectInput} from '../_shared/redirect-manual-records.ts';
import {domainProviderConfig,domainProviderInput} from '../_shared/redirect-domain-provider.ts';
import {domainInput,checkRedirectDomainDns} from '../_shared/redirect-domains.ts';
import {savedReportInput,reportShareInput,publicReportRequest} from '../_shared/redirect-reports.ts';
import { policyPatchInput } from '../_shared/redirect-policy-api.ts';
import { generateRedirectPreview } from '../_shared/redirect-preview-generation.ts';
import { isLlmConfigured } from '../_shared/llm-client.ts';
import { previewImageInfo } from "../_shared/redirect-presentation.ts";
import { policyErrors, hashLinkPassword } from "../_shared/link-policy.ts";
import { bulkLinkInput, linkInput, linkListInput, workspaceInput, LINK_SCOPES } from "../_shared/redirect-links.ts";
import { analyticsFilters } from "../_shared/redirect-analytics.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.50.5";
import { boundedJson, conversionInput, createRedirectToken, tokenDigest, UUID } from "../_shared/redirect-api.ts";

Deno.serve(async (req: Request) => {
 const origin=req.headers.get('origin') ?? '';
 const cors={ 'Access-Control-Allow-Origin':['https://queer.guide','https://www.queer.guide','http://localhost:5173','http://localhost:4178'].includes(origin)?origin:'', 'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type, x-qg-redirect-workspace', 'Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS', Vary:'Origin' };
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 const rpcError=(error:{code?:string;message:string})=>{const status=error.code==='23505'?409:error.code==='42501'?403:error.code==='P0002'?404:(error.code?.startsWith('22')||['23503','23514'].includes(error.code??''))?400:503;return json({error:status===503?'Redirect API temporarily unavailable':error.message},status);};
 if(req.method==='OPTIONS') return new Response(null,{headers:cors});
 const path=new URL(req.url).pathname.split('/redirect-api')[1]?.replace(/\/$/,'') ?? '';
 const credential=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'') ?? '';
 if(!credential)return json({error:'Unauthorized'},401);
 let db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 if(path==='/public-app-association')return publicAppAssociation(req,db);
 if(path==='/public-qr-image')return publicQrImageRequest(req,db,Deno.env.get('SUPABASE_URL')??'',cors);
 if(path==='/public-report')return publicReportRequest(req,db,Deno.env.get('REDIRECT_RELAY_SECRET')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,cors);
 const tokenCredential=/^qg_redirect_[a-f0-9]{64}$/.test(credential);
 let user: {id:string;created_at:string;email_confirmed_at?:string;confirmed_at?:string;is_anonymous?:boolean} | null=null;
 if(!tokenCredential){
  const identityClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+credential}}});
  const {data,error}=await identityClient.auth.getUser(credential);
  if(error || !data.user)return json({error:'Unauthorized'},401);
  user=data.user;
 }
 const requestedWorkspace=req.headers.get('x-qg-redirect-workspace');
 // Registry administration has explicit current-Owner checks and may prepare
 // co-Owners during provisioning. Business-resource selection stays fenced.
 const ownershipRegistry=path==='/workspace-ownership'||/^\/workspace-ownership\/[a-f0-9-]+$/i.test(path);
 // Native signup follows the recorded public click; visitor workspace headers are not attribution authority.
 const nativeSignup=path==='/native/signup'&&req.method==='POST';
 const recipientInvitation=path==='/invitations/accept'&&req.method==='POST'||path==='/invitations/received'&&req.method==='GET';
 const selectedWorkspace=nativeSignup||recipientInvitation?redirectWorkspaceSelection(null):ownershipRegistry&&requestedWorkspace!==null&&UUID.test(requestedWorkspace)?{id:requestedWorkspace.toLowerCase()}:redirectWorkspaceSelection(requestedWorkspace);
 if('error' in selectedWorkspace)return json({error:selectedWorkspace.error},selectedWorkspace.status);
 db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{global:{headers:{'x-qg-redirect-workspace':selectedWorkspace.id,...(user?{'x-qg-redirect-session-actor':user.id}:{})}}});
 const sessionPrincipal=async(scope:string):Promise<{id:string|null;role?:string;label?:string;workspace?:{id:string;name:string;slug:string};failure?:Response}>=>{
  if(!user||user.is_anonymous)return {id:null,failure:json({error:'A registered account is required'},403)};
  const result=await db.rpc('redirect_workspace_context',{p_actor:user.id,p_workspace:selectedWorkspace.id,p_scope:scope});
  if(result.error)return {id:null,failure:rpcError(result.error)};
  const context=result.data,principal=context?.principal;
  if(context?.workspace?.id!==selectedWorkspace.id||!principal||!['owner','member','viewer','billing'].includes(principal.role)||(principal.role==='owner'?principal.id!==null:typeof principal.id!=='string'||!UUID.test(principal.id)))return {id:null,failure:json({error:'Workspace authorization unavailable'},503)};
  return {id:principal.id,role:principal.role,label:principal.label,workspace:context.workspace};
 };
 try {
  if(path==='/workspace-ownership'||/^\/workspace-ownership\/[a-f0-9-]+$/i.test(path)){
   if(tokenCredential||!user||user.is_anonymous)return json({error:'Workspace Owner account session required'},403);
   const query=new URL(req.url).searchParams,target=path==='/workspace-ownership'?null:path.slice('/workspace-ownership/'.length);
   if(target&&!UUID.test(target))return json({error:'Choose an Owner account'},400);
   if(req.method==='GET'&&!target){
    const view=query.get('view')??'owners',after=query.get('after'),limit=Number(query.get('limit')??50);
    if([...query.keys()].some(key=>!['view','limit','after'].includes(key)||query.getAll(key).length!==1)||!['owners','candidates'].includes(view)||!Number.isInteger(limit)||limit<1||limit>100||after!==null&&!UUID.test(after))return json({error:'Invalid ownership page'},400);
    const result=await db.rpc('redirect_workspace_ownership',{p_actor:user.id,p_workspace:selectedWorkspace.id,p_action:view,p_limit:limit,p_after:after});
    return result.error?rpcError(result.error):json(result.data);
   }
   if(query.size)return json({error:'Invalid ownership query'},400);
   if(req.method==='POST'&&!target){
    const body=await boundedJson(req,4096);
    if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['memberId','expectedRole'].includes(key))||typeof body.memberId!=='string'||!UUID.test(body.memberId)||!['member','viewer','billing'].includes(body.expectedRole))return json({error:'Review a current member and their role'},400);
    const result=await db.rpc('redirect_workspace_ownership',{p_actor:user.id,p_workspace:selectedWorkspace.id,p_action:'admit',p_member:body.memberId,p_expected_role:body.expectedRole});
    return result.error?rpcError(result.error):json(result.data);
   }
   if(req.method==='DELETE'&&target){
    const body=await boundedJson(req,4096);
    if(!body||Array.isArray(body)||Object.keys(body).some(key=>key!=='version')||typeof body.version!=='string'||!UUID.test(body.version))return json({error:'Review the current Owner revision'},400);
    const result=await db.rpc('redirect_workspace_ownership',{p_actor:user.id,p_workspace:selectedWorkspace.id,p_action:'revoke',p_user:target,p_version:body.version});
    return result.error?rpcError(result.error):json(result.data);
   }
   return json({error:'Method not supported'},405);
  }
  if(path==='/integrations'||/^\/integrations\/[a-f0-9-]+$/i.test(path)){
   if(tokenCredential||!user||user.is_anonymous)return json({error:'Workspace account session required'},403);
   const query=new URL(req.url).searchParams,id=path==='/integrations'?null:path.slice('/integrations/'.length);
   if(id&&!UUID.test(id))return json({error:'Choose an integration'},400);
   if(req.method==='GET'&&!id){
    if([...query.keys()].some(key=>!['limit','after','requestId'].includes(key)||query.getAll(key).length!==1))return json({error:'Invalid integration page'},400);
    const requestId=query.get('requestId'),after=query.get('after'),limit=Number(query.get('limit')??50);
    if(requestId!==null&&(!UUID.test(requestId)||query.size!==1)||after!==null&&!UUID.test(after)||!Number.isInteger(limit)||limit<1||limit>100)return json({error:'Invalid integration page'},400);
    const result=await db.rpc('redirect_integration_installation',{p_actor:user.id,p_action:requestId?'lookup':'list',...(requestId?{p_id:requestId}:{p_limit:limit,p_after:after})});
    return result.error?rpcError(result.error):json(requestId?{installation:result.data}:result.data);
   }
   if(query.size)return json({error:'Invalid integration query'},400);
   if(req.method==='POST'&&!id){
    const body=await boundedJson(req,16384);
    if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['requestId','provider','name','linkIds','expiresAt'].includes(key))||typeof body.requestId!=='string'||!UUID.test(body.requestId))return json({error:'Provide a unique setup request ID and integration settings'},400);
    const secret=createRedirectToken(),result=await db.rpc('redirect_integration_installation',{p_actor:user.id,p_action:'create',p_id:body.requestId,p_values:{provider:body.provider,name:body.name,linkIds:body.linkIds,expiresAt:body.expiresAt,token_hash:await tokenDigest(secret),prefix:secret.slice(0,20)}});
    if(result.error)return rpcError(result.error);
    if(result.data?.retryAfter)return json(result.data,429);
    return json({...result.data,credential:result.data?.created===true?secret:null},result.data?.created===true?201:200);
   }
   if(req.method==='DELETE'&&id){
    const result=await db.rpc('redirect_integration_installation',{p_actor:user.id,p_action:'revoke',p_id:id});
    return result.error?rpcError(result.error):json(result.data);
   }
   return json({error:'Method not supported'},405);
  }
  if(path==='/workspace-information'){
   if(tokenCredential||!user||user.is_anonymous)return json({error:'Workspace account session required'},403);
   if(req.method!=='GET')return json({error:'Method not supported'},405);
   const query=new URL(req.url).searchParams,kind=query.get('kind'),limit=Number(query.get('limit')??50),after=query.get('after');
   if([...query.keys()].some(key=>!['kind','limit','after'].includes(key)||query.getAll(key).length!==1)||!kind||!['domains','tokens','webhooks'].includes(kind)||!Number.isInteger(limit)||limit<1||limit>100||after!==null&&!UUID.test(after))return json({error:'Choose domains, API keys or webhooks and a valid page'},400);
   const principal=await sessionPrincipal('workspace:read');if(principal.failure)return principal.failure;
   const {data,error}=await db.rpc('redirect_workspace_information',{p_actor:user.id,p_kind:kind,p_limit:limit,p_after:after});if(error)return rpcError(error);return json(data);
  }
  if(path==='/inventory'||path==='/inventory/metadata'||path==='/inventory/organization'){
   const read=req.method==='GET',scope=read?'links:read':'links:write';let principalId:string|null=null;
   if(tokenCredential){const auth=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:scope});if(auth.error)return rpcError(auth.error);if(!auth.data)return json({error:'Active inventory scope required'},403);principalId=auth.data.id;}
   else{const principal=await sessionPrincipal(scope);if(principal.failure)return principal.failure;principalId=principal.id;}
   const quota=await db.rpc('redirect_report_budget',{p_bucket:'inventory:'+(principalId??user!.id),p_limit:900,p_seconds:60});if(quota.error)return rpcError(quota.error);if(quota.data)return new Response(JSON.stringify({error:'Rate limit reached'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(quota.data)}});
   if(path==='/inventory'&&read){const args=inventoryQuery(new URL(req.url).searchParams);const {data,error}=await db.rpc('redirect_inventory_page',{...args,p_principal:principalId});if(error)return rpcError(error);return json(data);}
   if(path==='/inventory/metadata'&&read){const query=new URL(req.url).searchParams,key=query.get('id');if([...query.keys()].some(k=>k!=='id')||!key||key.length>4096)return json({error:'Choose an inventory record'},400);const {data,error}=await db.rpc('redirect_inventory_metadata',{p_manifest:redirectInventoryManifest,p_key:key,p_principal:principalId});if(error)return rpcError(error);return json(data);}
   if(path==='/inventory/organization'&&req.method==='POST'&&!new URL(req.url).search){const operations=inventoryOperations(await boundedJson(req,262144));const {data,error}=await db.rpc('redirect_inventory_organize',{p_manifest:redirectInventoryManifest,p_operations:operations,p_principal:principalId});if(error)return rpcError(error);return json(data);}
   return json({error:'Method not supported'},405);
  }
  const nativeApp=path.match(/^\/apps(?:\/([a-f0-9-]{36}))?$/i);
  if(nativeApp){
   if(tokenCredential||!user||user.is_anonymous)return json({error:'Owner account session required'},403);
   const id=nativeApp[1],query=new URL(req.url).searchParams;
   if(!id&&req.method==='GET'){
    const offset=Number(query.get('offset')??0);if([...query.keys()].some(k=>k!=='offset')||!Number.isInteger(offset)||offset<0||offset>10000000)return json({error:'Invalid app page'},400);
    const {data,error}=await db.rpc('redirect_native_app_admin',{p_actor:user.id,p_action:'list',p_offset:offset});if(error)return rpcError(error);return json(data);
   }
   if(query.size)return json({error:'Unexpected app query'},400);
   if((!id&&req.method==='POST')||(id&&['PATCH','DELETE'].includes(req.method))){
    const body=await boundedJson(req,32768);if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Provide app settings'},400);
    const {version,...values}=body as Record<string,unknown>;
    if(id&&(!UUID.test(String(version??''))))return json({error:'Provide the current app version'},400);
    if(!id&&version!==undefined)return json({error:'Version is not allowed on app creation'},400);
    if(req.method==='DELETE'&&Object.keys(values).length)return json({error:'Unexpected delete fields'},400);
    const patch=req.method==='DELETE'?{}:nativeAppValues(values,!id);
    const {data,error}=await db.rpc('redirect_native_app_admin',{p_actor:user.id,p_action:!id?'create':req.method==='DELETE'?'delete':'update',p_id:id??null,p_expected:version??null,p_values:patch});if(error)return rpcError(error);return json(data,id?200:201);
   }
   return json({error:'Method not supported'},405);
  }
  const invitation=path.match(/^\/invitations(?:\/(accept|received|[a-f0-9-]{36}))?$/i);
  if(invitation){
   if(tokenCredential||!user||user.is_anonymous)return json({error:'Account session required'},403);
   const part=invitation[1],query=new URL(req.url).searchParams;
   if(part==='accept'&&req.method==='POST'&&!query.size){
    const budget=await db.rpc('redirect_report_budget',{p_bucket:'invitation-accept:'+user.id,p_limit:200,p_seconds:3600});if(budget.error)return rpcError(budget.error);if(budget.data)return new Response(JSON.stringify({error:'Invitation attempt limit reached'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(budget.data)}});
    const body=await boundedJson(req,4096) as Record<string,unknown>;
    if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['token','id'].includes(k))||(body.token===undefined)===(body.id===undefined)||(body.token!==undefined&&(typeof body.token!=='string'||!/^qg_invite_[a-f0-9]{64}$/.test(body.token)))||(body.id!==undefined&&(typeof body.id!=='string'||!UUID.test(body.id))))return json({error:'Choose an invitation'},400);
    const {data,error}=await db.rpc('redirect_workspace_invitation',{p_actor:user.id,p_action:'accept',p_hash:typeof body.token==='string'?await tokenDigest(body.token):null,p_id:body.id??null});if(error)return rpcError(error);return json(data);
   }
   if(part==='received'&&req.method==='GET'){
    const offset=Number(query.get('offset')??0);if([...query.keys()].some(k=>k!=='offset')||!Number.isInteger(offset)||offset<0||offset>10000000)return json({error:'Invalid invitation page'},400);
    const {data,error}=await db.rpc('redirect_invitation_inbox',{p_actor:user.id,p_offset:offset});if(error)return rpcError(error);return json(data);
   }
   // The SQL routine checks the actual owner role under the ACL lock.
   if(!part&&req.method==='GET'){
    const offset=Number(query.get('offset')??0);if([...query.keys()].some(k=>k!=='offset')||!Number.isInteger(offset)||offset<0||offset>10000000)return json({error:'Invalid invitation page'},400);
    const {data,error}=await db.rpc('redirect_workspace_invitation',{p_actor:user.id,p_action:'list',p_offset:offset});if(error)return rpcError(error);return json(data);
   }
   if(!part&&req.method==='POST'&&!query.size){
    const values=await boundedJson(req,4096),secret=createRedirectToken().replace('qg_redirect_','qg_invite_');
    const {data,error}=await db.rpc('redirect_workspace_invitation',{p_actor:user.id,p_action:'create',p_values:values,p_hash:await tokenDigest(secret)});if(error)return rpcError(error);return json({...data,invitationUrl:'https://queer.guide/links-workspace#invite='+secret},201);
   }
   if(part&&UUID.test(part)&&req.method==='DELETE'&&!query.size){const {data,error}=await db.rpc('redirect_workspace_invitation',{p_actor:user.id,p_action:'revoke',p_id:part});if(error)return rpcError(error);return json(data);}
   return json({error:'Method not supported'},405);
  }
  if(path==='/workspaces'){
   if(tokenCredential)return json({error:'Account session required'},403);
   if(req.method!=='GET')return json({error:'Method not supported'},405);
   if(new URL(req.url).search)return json({error:'Unexpected workspace query'},400);
   const principal=await sessionPrincipal('links:read');if(principal.failure)return principal.failure;
   return json({data:[{...principal.workspace,role:principal.role}],currentWorkspaceId:principal.workspace!.id});
  }
  if(path==='/session'&&req.method==='GET'){if(tokenCredential)return json({error:'Account session required'},403);const principal=await sessionPrincipal('links:read');if(principal.failure)return principal.failure;return json({role:principal.role,label:principal.label??null,workspace:principal.workspace});}
  const manual=path.match(/^\/manual-records(?:\/([a-f0-9-]{36}))?$/i);
  if(manual){
   if(tokenCredential)return json({error:'Workspace owner account session required'},403);
   const principal=await sessionPrincipal('workspace:write');if(principal.failure)return principal.failure;if(principal.id!==null)return json({error:'Workspace owner access required'},403);
   const id=manual[1]??null;if(id&&!UUID.test(id)||new URL(req.url).search)return json({error:'Invalid manual redirect request'},400);
   let values=null,expected=null;
   if(req.method==='GET'&&id){/* Read the current record through the private RPC below. */}
   else if(req.method===(id?'PATCH':'POST')){
    const body=await boundedJson(req,262144);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['values','expectedUpdatedAt'].includes(key))||id&&(typeof body.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(body.expectedUpdatedAt)))||!id&&body.expectedUpdatedAt!=null)return json({error:'Provide redirect fields and the current record timestamp'},400);
    values=manualRedirectInput(body.values,!id);expected=body.expectedUpdatedAt??null;
   }else return json({error:'Method not supported'},405);
   const result=await db.rpc('redirect_manual_record',{p_actor:user!.id,p_id:id,p_values:values,p_expected_updated_at:expected});if(result.error)return rpcError(result.error);return json(result.data,id?200:201);
  }
  const passwordBranding=path.match(/^\/links\/([a-f0-9-]{36})\/password-branding(\/logo)?$/i);
  if(passwordBranding){
    const [,id,logo]=passwordBranding;const read=req.method==='GET';
    if(!UUID.test(id)||new URL(req.url).search)return json({error:'Invalid password branding request'},400);
    if(logo?req.method!=='POST':!['GET','PATCH'].includes(req.method))return json({error:'Method not supported'},405);
    let principalId:string|null=null;const scope=read?'links:read':'links:write';
    if(tokenCredential){const auth=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:scope});if(auth.error)return rpcError(auth.error);if(!auth.data)return json({error:'Link scope is required'},403);principalId=auth.data.id;}
    else{const principal=await sessionPrincipal(scope);if(principal.failure)return principal.failure;principalId=principal.id;}
    if(logo){
      const input=await qrLogoInput(await boundedJson(req,2100000));const config=qrAssetStorageConfig(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'');if(!config)return json({error:'Logo storage is not configured'},503);
      const result=await storePasswordLogo(db,config,user?.id??null,principalId,id,input);if(result.error)return result.error.code==='QR_STORAGE'?json({error:result.error.message},503):rpcError({code:result.error.code,message:result.error.message??'Password branding unavailable'});return json(qrLogoPublicResponse(result.data,Deno.env.get('SUPABASE_URL')??''));
    }
    const values=read?{}:passwordBrandingInput(await boundedJson(req,4096));
    const result=await db.rpc('redirect_password_branding_resource',{p_action:read?'get':'patch',p_actor:user?.id??null,p_principal:principalId,p_link:id,p_values:values});if(result.error)return rpcError(result.error);return json(qrLogoPublicResponse(result.data,Deno.env.get('SUPABASE_URL')??''));
  }
  const webhooks = path.match(/^\/webhooks(?:\/([a-f0-9-]{36}))?(?:\/(rotate|test|deliveries)(?:\/([a-f0-9-]{36})(?:\/(replay|attempts))?)?)?$/i);
  if (webhooks) {
    const [, id, endpoint, deliveryId, deliveryAction] = webhooks;
    if ((id && !UUID.test(id)) || (deliveryId && !UUID.test(deliveryId)) || (endpoint && !id) || (deliveryId && endpoint !== 'deliveries'))
      return json({error:'Invalid webhook request'},400);
    const read = req.method === 'GET', scope = read ? 'workspace:read' : 'workspace:write';
    let principalId: string | null = null;
    if(tokenCredential){
      const auth=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:scope});
      if(auth.error)return rpcError(auth.error);
      if(!auth.data)return json({error:'Webhook workspace scope is required'},403);
      principalId=auth.data.id;
    }else{
      const principal=await sessionPrincipal(scope);if(principal.failure)return principal.failure;
      if(principal.id!==null)return json({error:'Workspace owner access required'},403);
    }
    const query=new URL(req.url).searchParams;
    let action:string, values:Record<string,unknown>={}, limit=50, cursor:string|null=null, archived=false;
    if(endpoint==='deliveries'){
      if(read && deliveryAction!=='replay'){
        action=deliveryAction==='attempts'?'attempts':deliveryId?'get':'list';
        if(action==='get' && query.size)return json({error:'Delivery details do not accept query fields'},400);
        const page=webhookPage(query,true);limit=page.limit;cursor=page.cursor;
      }else if(req.method==='POST' && deliveryId && deliveryAction==='replay' && !query.size){
        action='replay';values=webhookVersionInput(await boundedJson(req,4096));
      }else return json({error:'Method not supported'},405);
      const result=await db.rpc('redirect_webhook_delivery_resource',{p_action:action,p_actor:user?.id??null,p_principal:principalId,p_webhook:id,p_id:deliveryId??null,p_values:values,p_limit:limit,p_after:cursor});
      if(result.error)return rpcError(result.error);return json(result.data);
    }
    if(endpoint){
      if(req.method!=='POST'||query.size)return json({error:'Method not supported'},405);
      action=endpoint;values=webhookVersionInput(await boundedJson(req,4096));
    }else if(read){
      action=id?'get':'list';
      if(id&&query.size)return json({error:'Webhook details do not accept query fields'},400);
      const page=webhookPage(query);limit=page.limit;cursor=page.cursor;archived=page.archived;
    }else if(req.method==='POST'&&!id&&!query.size){action='create';values=webhookInput(await boundedJson(req,65536),true);}
    else if(req.method==='PATCH'&&id&&!query.size){action='patch';values=webhookInput(await boundedJson(req,65536));}
    else if(req.method==='DELETE'&&id&&!query.size){action='archive';values=webhookVersionInput(await boundedJson(req,4096));}
    else return json({error:'Method not supported'},405);
    const result=await db.rpc('redirect_webhook_resource',{p_action:action,p_actor:user?.id??null,p_principal:principalId,p_id:id??null,p_values:values,p_secret:['create','rotate'].includes(action)?createWebhookSecret():null,p_limit:limit,p_after:cursor,p_archived:archived});
    if(result.error)return rpcError(result.error);return json(result.data,action==='create'?201:200);
  }
  const qrImages = path.match(/^\/qr-images(?:\/([a-f0-9-]{36}))?$/i);
  if (qrImages) {
    let principalId: string | null = null;
    if (tokenCredential) {
      const auth = await db.rpc('authenticate_redirect_api_token', {
        p_hash: await tokenDigest(credential),
        p_scope: 'links:read',
      });
      if (auth.error)
        return json({ error: 'Credential verification unavailable' }, 503);
      if (!auth.data) return json({ error: 'Read scope is required' }, 403);
      principalId = auth.data.id;
    } else {
      const principal = await sessionPrincipal('links:read');
      if (principal.failure) return principal.failure;
      principalId = principal.id;
    }
    const id = qrImages[1] ?? null,
      q = new URL(req.url).searchParams;
    let artwork: Awaited<ReturnType<typeof qrLogoInput>> | null = null;
    let artworkConfig: ReturnType<typeof qrAssetStorageConfig> = null;
    let action: string,
      values: unknown = null,
      token: string | null = null,
      limit = 100,
      after: string | null = null;
    if (req.method === 'POST' && !id && !q.size) {
      action = 'create';
      const input = qrImageLinkInput(await boundedJson(req, 2100000));
      if (typeof input.logo === 'string') {
        artwork = await qrLogoInput({ version: null, image: input.logo });
        artworkConfig = qrAssetStorageConfig(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        if (!artworkConfig)
          return json({ error: 'Artwork storage is not configured' }, 503);
        delete input.logo;
      }
      values = input;
      token = createQrImageToken();
    } else if (req.method === 'GET' && !id) {
      action = 'list';
      limit = Number(q.get('limit') ?? 100);
      after = q.get('cursor');
      if (
        [...q.keys()].some(
          (key) =>
            !['limit', 'cursor'].includes(key) || q.getAll(key).length !== 1,
        ) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (after && !UUID.test(after))
      )
        return json({ error: 'Invalid image link page' }, 400);
    } else if (req.method === 'DELETE' && id && !q.size) {
      action = 'revoke';
      values = qrImageRevokeInput(await boundedJson(req, 1024));
    } else return json({ error: 'Method not supported' }, 405);
    let result: Awaited<ReturnType<typeof storeQrImageArtwork>> = await db.rpc('redirect_qr_image_resource', {
      p_action: action,
      p_actor: user?.id ?? null,
      p_principal: principalId,
      p_id: id,
      p_values: values,
      p_hash: token ? await tokenDigest(token) : null,
      p_limit: limit,
      p_after: after,
    });
    if (result.error) return rpcError({ code: result.error.code, message: result.error.message ?? 'QR image publication failed' });
    if (result.data?.retryAfter)
      return new Response(
        JSON.stringify({ error: 'QR image link limit reached' }),
        {
          status: 429,
          headers: {
            ...cors,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Retry-After': String(result.data.retryAfter),
          },
        },
      );
    if (artwork && token) {
      result = await storeQrImageArtwork(
        db,
        artworkConfig!,
        user?.id ?? null,
        principalId,
        result.data,
        artwork,
      );
      if (result.error)
        return result.error.code?.startsWith('QR_')
          ? json({ error: result.error.message }, 503)
          : rpcError({ code: result.error.code, message: result.error.message ?? 'QR image publication failed' });
      if (result.data?.retryAfter)
        return new Response(
          JSON.stringify({ error: 'QR image link limit reached' }),
          {
            status: 429,
            headers: {
              ...cors,
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
              'Retry-After': String(result.data.retryAfter),
            },
          },
        );
    }
    const prepared =
      action === 'list'
        ? {
            ...result.data,
            data: qrLogoPublicResponse(
              result.data.data,
              Deno.env.get('SUPABASE_URL') ?? '',
            ),
          }
        : qrLogoPublicResponse(result.data, Deno.env.get('SUPABASE_URL') ?? '');
    return json(
      token ? { ...prepared, imageUrls: qrImageUrls(token) } : prepared,
      token ? 201 : 200,
    );
  }
  const qrStyles=path.match(/^\/qr-styles\/(workspace|domains\/([a-f0-9-]{36})|links(?:\/([a-f0-9-]{36}))?)(\/logo)?$/i);
  if(qrStyles){
   const [,rawKind,domainId,linkId,logoEndpoint]=qrStyles;const kind=rawKind.toLowerCase();
   if(kind.startsWith('links')){
    if(req.method!=='GET'||logoEndpoint)return json({error:'Method not supported'},405);
    let principalId:string|null=null;
    if(tokenCredential){const auth=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:'links:read'});if(auth.error)return json({error:'Credential verification unavailable'},503);if(!auth.data)return json({error:'Read scope is required'},403);principalId=auth.data.id;}
    else{const principal=await sessionPrincipal('links:read');if(principal.failure)return principal.failure;principalId=principal.id;}
    const q=new URL(req.url).searchParams,ids=linkId?[linkId]:(q.get('ids')??'').split(',');
    if([...q.keys()].some(key=>key!=='ids')||linkId&&q.size||!ids.length||ids.length>100||ids.some(id=>!UUID.test(id))||new Set(ids).size!==ids.length)return json({error:'Choose 1–100 distinct link IDs'},400);
    const result=await db.rpc('redirect_qr_styles_for_links',{p_ids:ids,p_token_id:principalId});if(result.error)return rpcError(result.error);const styled=qrLogoPublicResponse(result.data,Deno.env.get('SUPABASE_URL')??'');return json(linkId?styled[0]:{data:styled});
   }
   if(tokenCredential)return json({error:'Workspace owner account session required'},403);
   const principal=await sessionPrincipal('workspace:write');if(principal.failure)return principal.failure;if(principal.id!==null)return json({error:'Workspace owner access required'},403);
   if(logoEndpoint){
    if(req.method!=='POST'||new URL(req.url).search)return json({error:'Method not supported'},405);
    const config=qrAssetStorageConfig(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'');if(!config)return json({error:'Logo storage is not configured'},503);
    const input=await qrLogoInput(await boundedJson(req,2100000));
    const result=await storeRedirectQrLogo(db,config,user!.id,domainId??null,input);if(result.error){if(result.error.code==='QR_STORAGE')return json({error:result.error.message},503);return rpcError({code:result.error.code,message:result.error.message??'Logo upload unavailable'});}
    if(result.data?.retryAfter)return new Response(JSON.stringify({error:'Logo upload limit reached'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(result.data.retryAfter)}});
    return json(qrLogoPublicResponse(result.data,Deno.env.get('SUPABASE_URL')??''));
   }
   if(!['GET','PATCH'].includes(req.method))return json({error:'Method not supported'},405);if(new URL(req.url).search)return json({error:'Invalid QR style request'},400);
   const values=req.method==='PATCH'?qrStylePreferenceInput(await boundedJson(req,4096)):null;
   const result=await db.rpc('redirect_qr_style_resource',{p_actor:user!.id,p_domain:domainId??null,p_values:values});if(result.error)return rpcError(result.error);return json(qrLogoPublicResponse(result.data,Deno.env.get('SUPABASE_URL')??''));
  }
  if(path==='/domain-choices'||path==='/linked-domains'){
   if(req.method!=='GET')return json({error:'Method not supported'},405);
   let principalId:string|null=null;
   if(tokenCredential){const {data,error}=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:'links:read'});if(error)return json({error:'Credential verification unavailable'},503);if(!data)return json({error:'Read scope is required'},403);principalId=data.id;}
   else{const principal=await sessionPrincipal('links:read');if(principal.failure)return principal.failure;principalId=principal.id;}
   const q=new URL(req.url).searchParams,limit=Number(q.get('limit')??100),after=q.get('cursor');
   if([...q.keys()].some(key=>!['limit','cursor'].includes(key))||!Number.isInteger(limit)||limit<1||limit>100||after&&!UUID.test(after))return json({error:'Invalid domain page'},400);
   const result=await db.rpc(path==='/linked-domains'?'redirect_linked_domains':'redirect_domain_choices',{p_token_id:principalId,p_limit:limit,p_after:after});if(result.error)return rpcError(result.error);return json(result.data);
  }
  if(path==='/domain-preference'){
   if(tokenCredential)return json({error:'Workspace owner account session required'},403);
   const principal=await sessionPrincipal('workspace:write');if(principal.failure)return principal.failure;if(principal.id!==null)return json({error:'Workspace owner access required'},403);
   if(!['GET','PATCH'].includes(req.method))return json({error:'Method not supported'},405);if(new URL(req.url).search)return json({error:'Invalid preference parameters'},400);
   let values=null;
   if(req.method==='PATCH'){
    const body=await boundedJson(req,16384);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['domainId','version'].includes(key))||!Object.hasOwn(body,'domainId')||body.domainId!==null&&(typeof body.domainId!=='string'||!UUID.test(body.domainId))||!Object.hasOwn(body,'version')||body.version!==null&&(typeof body.version!=='string'||!UUID.test(body.version)))return json({error:'Provide a domain ID or null and the current preference version'},400);
    values=body;
   }
   const result=await db.rpc('redirect_domain_preference',{p_actor:user!.id,p_values:values});if(result.error)return rpcError(result.error);return json(result.data);
  }
  const instructionMail=path.match(/^\/domains\/([a-f0-9-]{36})\/(instructions|instruction-emails)(?:\/([a-f0-9-]{36})(?:\/(cancel))?)?$/i);
  if(instructionMail){
   if(tokenCredential)return json({error:'Workspace owner account session required'},403);
   const principal=await sessionPrincipal('workspace:write');if(principal.failure)return principal.failure;if(principal.id!==null)return json({error:'Workspace owner access required'},403);
   const [,domain,part,job,cancel]=instructionMail;
   if(part==='instructions'&&(new URL(req.url).search||job||cancel)||part==='instruction-emails'&&job&&new URL(req.url).search)return json({error:'Invalid instruction email request'},400);
   if(part==='instruction-emails'&&!job){
    if(req.method!=='GET')return json({error:'Method not supported'},405);
    const query=new URL(req.url).searchParams,requestId=query.get('requestId');
    if(query.size===0){const result=await db.rpc('redirect_domain_instruction_mail_latest',{p_actor:user!.id,p_domain:domain});if(result.error)return rpcError(result.error);return json({mail:result.data});}
    if(query.size!==1||query.getAll('requestId').length!==1||!requestId||!UUID.test(requestId))return json({error:'Choose an instruction email request'},400);
    const result=await db.rpc('redirect_domain_instruction_mail_action',{p_action:'lookup',p_actor:user!.id,p_domain:domain,p_values:{requestId}});if(result.error)return rpcError(result.error);return json({mail:result.data});
   }
   if(part==='instruction-emails'){
    if(cancel?req.method!=='POST':req.method!=='GET')return json({error:'Method not supported'},405);
    if(cancel){const body=await boundedJson(req,4096);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return json({error:'Do not provide cancellation fields'},400);}
    const result=await db.rpc('redirect_domain_instruction_mail_action',{p_action:cancel?'cancel':'get',p_actor:user!.id,p_domain:domain,p_job:job});if(result.error)return rpcError(result.error);return json(result.data);
   }
   if(!['GET','POST'].includes(req.method))return json({error:'Method not supported'},405);
   const config=await domainInstructionMailConfig(Deno.env.get('EMAIL_GATEWAY_SECRET')??'',Deno.env.get('REDIRECT_DOMAIN_EMAIL_FROM')??'',Deno.env.get('REDIRECT_CNAME_TARGET')??'',Deno.env.get('EMAIL_GATEWAY_URL')??'');
   if(!config)return json({error:'DNS instruction email is not configured'},503);
   const values=req.method==='POST'?instructionMailInput(await boundedJson(req,16384)):{};
   const result=await db.rpc('redirect_domain_instruction_mail_action',{p_action:req.method==='POST'?'queue':'draft',p_actor:user!.id,p_domain:domain,p_values:values,p_target:config.target});if(result.error)return rpcError(result.error);
   if(result.data?.retryAfter)return new Response(JSON.stringify({error:'Please wait before emailing more DNS instructions'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(result.data.retryAfter)}});
   if(req.method==='GET')return json(result.data);
   try{await dispatchDomainInstructionMail(db,config,fetch,result.data.id);}catch{/* The stored request ID remains authoritative after an unknown transport/ack outcome. */}
   const receipt=await db.rpc('redirect_domain_instruction_mail_action',{p_action:'get',p_actor:user!.id,p_domain:domain,p_job:result.data.id});if(receipt.error)return rpcError(receipt.error);return json(receipt.data,202);
  }
  const dnsSetup=path.match(/^\/domains\/([a-f0-9-]{36})\/dns-setup\/(discover|approve|complete)$/i);
  const dnsCallback=path.match(/^\/domain-connect\/([a-f0-9-]{36})$/i);
  if(dnsSetup||dnsCallback){
   if(tokenCredential)return json({error:'Workspace owner account session required'},403);
   const principal=await sessionPrincipal('workspace:write');if(principal.failure)return principal.failure;if(principal.id!==null)return json({error:'Workspace owner access required'},403);
   if(new URL(req.url).search)return json({error:'Unexpected DNS setup parameters'},400);
   if(dnsSetup&&req.method!=='POST'||dnsCallback&&req.method!=='GET')return json({error:'Method not supported'},405);
   const config=await domainConnectConfig(Deno.env.get('REDIRECT_DOMAIN_CONNECT_PRIVATE_JWK')??'',Deno.env.get('REDIRECT_DOMAIN_CONNECT_KEY_LABEL')??'',Deno.env.get('REDIRECT_CNAME_TARGET')??'');
   if(!config)return json({error:'Automatic DNS setup is not configured'},503);
   if(dnsCallback){const result=await db.rpc('redirect_domain_connect_current',{p_actor:user!.id,p_operation:dnsCallback[1],p_configuration:config.fingerprint});if(result.error)return rpcError(result.error);return json(result.data);}
   const [,domain,action]=dnsSetup!;const operation=action as 'discover'|'approve'|'complete';
   const input=domainConnectInput(await boundedJson(req,16384),operation);
   const result=await runDomainConnectAction(db,user!.id,domain,operation,input,config);if(result.error)return rpcError(result.error);
   if(result.data?.retryAfter)return new Response(JSON.stringify({error:'Please wait before checking DNS setup again'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(result.data.retryAfter)}});
   return json(result.data);
  }
  const domains=path.match(/^\/domains(?:\/([a-f0-9-]{36}))?(?:\/(verify|rotate|provider)(?:\/(connect|refresh|disconnect|adopt|confirm-absence|restart-validation))?)?$/i);
  if(domains){
   if(tokenCredential)return json({error:'Workspace owner account session required'},403);
   const principal=await sessionPrincipal('workspace:write');if(principal.failure)return principal.failure;
   if(principal.id!==null)return json({error:'Workspace owner access required'},403);
   const [,id,endpoint,providerAction]=domains;if(id&&!UUID.test(id)||endpoint&&!id||providerAction&&endpoint!=='provider')return json({error:'Invalid domain ID'},400);
   const providerConfig=domainProviderConfig(Deno.env.get('REDIRECT_CF_ZONE_ID')??'',Deno.env.get('REDIRECT_CF_API_TOKEN')??'',Deno.env.get('REDIRECT_CNAME_TARGET')??'');
   if(endpoint==='provider'){
    if(req.method!=='POST'||!providerAction)return json({error:'Method not supported'},405);
    if(!providerConfig)return json({error:'Hostname provider is not configured'},503);
    const values=domainProviderInput(await boundedJson(req,16384),providerAction);
    const result=providerAction==='restart-validation'?await db.rpc('request_redirect_domain_validation_restart',{p_actor:user!.id,p_id:id,p_version:values.version,p_zone:providerConfig.zoneId,p_target:providerConfig.cnameTarget}):await db.rpc('redirect_domain_provider_action',{p_actor:user!.id,p_id:id,p_version:values.version,p_action:providerAction.replace('-','_'),p_zone:providerConfig.zoneId,p_target:providerConfig.cnameTarget,p_candidate:values.candidateId??null});if(result.error)return rpcError(result.error);return json(result.data);
   }
   let action:string,values:Record<string,unknown>={},limit=50,after:string|null=null;
   if(endpoint==='verify'&&req.method==='POST'){
    values=domainInput(await boundedJson(req,16384),'version');
    const reserved=await db.rpc('redirect_domain_resource',{p_action:'reserve',p_actor:user!.id,p_id:id,p_values:values});if(reserved.error)return rpcError(reserved.error);
    if(reserved.data.retryAfter)return new Response(JSON.stringify({error:'Please wait before checking DNS again'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(reserved.data.retryAfter)}});
    const domain=reserved.data.domain,outcome=await checkRedirectDomainDns(domain.verification);
    const result=await db.rpc('redirect_domain_check_result',{p_actor:user!.id,p_id:id,p_version:domain.version,p_attempt:reserved.data.attempt,p_outcome:outcome});if(result.error)return rpcError(result.error);return json(result.data);
   }
   if(endpoint==='rotate'&&req.method==='POST'){action='rotate';values=domainInput(await boundedJson(req,16384),'version');}
   else if(!endpoint&&req.method==='GET'){
    action=id?'get':'list';const q=new URL(req.url).searchParams;
    if(id&&q.size||[...q.keys()].some(key=>!['limit','cursor','archive','q'].includes(key)||q.getAll(key).length!==1))return json({error:'Invalid domain page'},400);
    limit=Number(q.get('limit')??50);after=q.get('cursor');const archive=q.get('archive')??'active',search=(q.get('q')??'').trim();
    if(!Number.isInteger(limit)||limit<1||limit>100||after&&!UUID.test(after)||!['active','archived','all'].includes(archive)||search.length>253||Array.from(search).some(char=>char.charCodeAt(0)<32))return json({error:'Invalid domain page'},400);
    if(!id)values={archive,...(search?{q:search}:{})};
   }
   else if(!id&&req.method==='POST'){action='create';values=domainInput(await boundedJson(req,16384),'create');}
   else if(id&&!endpoint&&req.method==='PATCH'){action='patch';values=domainInput(await boundedJson(req,16384),'patch');}
   else if(id&&!endpoint&&req.method==='DELETE'){action='delete';values=domainInput(await boundedJson(req,16384),'version');}else return json({error:'Method not supported'},405);
   const result=await db.rpc('redirect_domain_resource',{p_action:action,p_actor:user!.id,p_id:id??null,p_values:values,p_limit:limit,p_after:after});if(result.error)return rpcError(result.error);return json(action==='list'?{...result.data,providerSetup:{configured:providerConfig!==null,cnameTarget:providerConfig?.cnameTarget??null},instructionMail:{configured:(await domainInstructionMailConfig(Deno.env.get('EMAIL_GATEWAY_SECRET')??'',Deno.env.get('REDIRECT_DOMAIN_EMAIL_FROM')??'',Deno.env.get('REDIRECT_CNAME_TARGET')??'',Deno.env.get('EMAIL_GATEWAY_URL')??''))!==null},dnsSetup:{configured:(await domainConnectConfig(Deno.env.get('REDIRECT_DOMAIN_CONNECT_PRIVATE_JWK')??'',Deno.env.get('REDIRECT_DOMAIN_CONNECT_KEY_LABEL')??'',Deno.env.get('REDIRECT_CNAME_TARGET')??''))!==null,cnameTarget:'links.queer.guide'}}:result.data,action==='create'?201:200);
  }
  if (path === '/customers/profile' || path === '/customers/journey') {
    const read = req.method === 'GET';
    if (!read && (path !== '/customers/profile' || !['PATCH', 'DELETE'].includes(req.method)))
      return json({ error: 'Method not supported' }, 405);
    const scope = read ? 'events:read' : 'links:write';
    let principalId: string | null = null;
    if (tokenCredential) {
      const auth = await db.rpc('authenticate_redirect_api_token', {
        p_hash: await tokenDigest(credential),
        p_scope: scope,
      });
      if (auth.error) return rpcError(auth.error);
      if (!auth.data) return json({ error: 'Customer scope is required' }, 403);
      principalId = auth.data.id;
    } else {
      const principal = await sessionPrincipal(scope);
      if (principal.failure) return principal.failure;
      principalId = principal.id;
    }
    const q = new URL(req.url).searchParams;
    if (path === '/customers/journey') {
      const page = customerPage(q);
      const { data, error } = await db.rpc('redirect_customer_events', {
        p_customer: page.id,
        p_actor: user?.id ?? null,
        p_principal: principalId,
        p_after_at: page.cursor?.at ?? null,
        p_after_id: page.cursor?.id ?? null,
        p_limit: page.limit,
      });
      if (error) return rpcError(error);
      return json(data);
    }
    let id: string,
      values: Record<string, unknown> = {};
    if (read) {
      if ([...q.keys()].some((key) => key !== 'id' || q.getAll(key).length !== 1))
        return json({ error: 'Provide only a customer ID' }, 400);
      id = customerId(q.get('id'));
    } else {
      if (q.size) return json({ error: 'Profile writes do not accept query fields' }, 400);
      const input = customerProfileInput(await boundedJson(req, 4096), req.method === 'DELETE');
      id = input.id;
      values = input.values;
    }
    const { data, error } = await db.rpc('redirect_customer_profile', {
      p_action: read ? 'get' : req.method === 'DELETE' ? 'clear' : 'patch',
      p_customer: id,
      p_actor: user?.id ?? null,
      p_principal: principalId,
      p_values: values,
    });
    if (error) return rpcError(error);
    return json(data);
  }
  const reports=path.match(/^\/reports(?:\/([a-f0-9-]{36}))?(?:\/(run|shares)(?:\/([a-f0-9-]{36}))?)?$/i);
  if(reports){
   if(tokenCredential)return json({error:'Account session required'},403);
   const principal=await sessionPrincipal('events:read');if(principal.failure)return principal.failure;
   const [,id,endpoint,shareId]=reports;if(id&&!UUID.test(id)||shareId&&!UUID.test(shareId)||endpoint&&!id)return json({error:'Invalid report ID'},400);
   if(endpoint==='shares'){
    let action:string,values:Record<string,unknown>={},passwordHash=null;
    if(req.method==='GET'&&!shareId)action='list';
    else if(req.method==='DELETE'&&shareId)action='revoke';
    else if(req.method==='POST'&&!shareId){action='create';const input=reportShareInput(await boundedJson(req));values=input.values;
     if(input.password){const reserved=await db.rpc('reserve_redirect_report_password',{p_actor:user!.id,p_principal:principal.id});if(reserved.error)return rpcError(reserved.error);if(reserved.data)return new Response(JSON.stringify({error:'Password update limit reached'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(reserved.data)}});passwordHash=await hashLinkPassword(input.password);}
    }else return json({error:'Method not supported'},405);
    const {data,error}=await db.rpc('redirect_report_share_resource',{p_action:action,p_actor:user!.id,p_principal:principal.id,p_report:id,p_id:shareId??null,p_values:values,p_password_hash:passwordHash});if(error)return rpcError(error);return json(data,action==='create'?201:200);
   }
   let action:string,values:Record<string,unknown>={},limit=50,after:string|null=null;
   if(req.method==='GET'&&endpoint==='run')action='run';
   else if(req.method==='GET'&&!endpoint){action=id?'get':'list';const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>!['limit','cursor','view'].includes(k)||q.getAll(k).length!==1)||id&&q.size)return json({error:'Invalid report page'},400);const view=q.get('view')??'personal';if(!['personal','team','all'].includes(view))return json({error:'Invalid report view'},400);values={view};limit=Number(q.get('limit')??50);after=q.get('cursor');if(!Number.isInteger(limit)||limit<1||limit>100||after&&!UUID.test(after))return json({error:'Invalid report page'},400);}
   else if(req.method==='POST'&&!id){action='create';values=savedReportInput(await boundedJson(req),true);}
   else if(req.method==='PATCH'&&id&&!endpoint){action='patch';values=savedReportInput(await boundedJson(req),false);}
   else if(req.method==='DELETE'&&id&&!endpoint)action='delete';else return json({error:'Method not supported'},405);
   const {data,error}=await db.rpc('redirect_saved_report_resource',{p_action:action,p_actor:user!.id,p_principal:principal.id,p_id:id??null,p_values:values,p_limit:limit,p_after:after});if(error)return rpcError(error);return json(data,action==='create'?201:200);
  }
  const requestMatch=path.match(/^\/access-requests(?:\/([a-f0-9-]{36}))?$/i);
  if(requestMatch){
   if(tokenCredential)return json({error:'Account session required'},403);
   const principal=await sessionPrincipal('workspace:read');if(principal.failure)return principal.failure;
   const id=requestMatch[1];if(id&&!UUID.test(id))return json({error:'Invalid request ID'},400);
   if(req.method==='GET'&&!id){
    const query=new URL(req.url).searchParams,view=query.get('view')??'mine',limit=Number(query.get('limit')??50),cursor=query.get('cursor');
    if([...query.keys()].some(k=>!['view','limit','cursor'].includes(k))||!['mine','review'].includes(view)||!Number.isInteger(limit)||limit<1||limit>100||cursor&&!UUID.test(cursor))return json({error:'Invalid request page'},400);
    const {data,error}=await db.rpc('redirect_access_requests_page',{p_principal:principal.id,p_view:view,p_limit:limit,p_after:cursor});if(error)return rpcError(error);return json(data);
   }
   let action:string,folder:string|null=null,message='',permission='edit';
   if(req.method==='POST'&&!id){const body=await boundedJson(req);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['folderId','message'].includes(k))||typeof body.folderId!=='string'||!UUID.test(body.folderId)||body.message!==undefined&&(typeof body.message!=='string'||body.message.length>1000))return json({error:'Provide a folder and optional message (up to 1,000 characters)'},400);action='create';folder=body.folderId;message=body.message??'';}
   else if(req.method==='PATCH'&&id){const body=await boundedJson(req);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','permission'].includes(k))||!['approve','deny'].includes(body.action)||body.permission!==undefined&&!['edit','owner'].includes(body.permission))return json({error:'Choose approve or deny and edit or owner access'},400);action=body.action;permission=body.permission??'edit';}
   else if(req.method==='DELETE'&&id)action='cancel';else return json({error:'Method not supported'},405);
   const {data,error}=await db.rpc('redirect_access_request',{p_action:action,p_principal:principal.id,p_id:id??null,p_folder:folder,p_message:message,p_permission:permission,p_actor:user!.id});if(error)return rpcError(error);
   if(data.retryAfter)return new Response(JSON.stringify({error:'Please wait before requesting access again',retryAfter:data.retryAfter}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(data.retryAfter)}});
   return json(data,action==='create'&&!data.duplicate?201:200);
  }
  const memberMatch=path.match(/^\/members(?:\/([a-f0-9-]{36}))?$/i);
  if(memberMatch){
   if(tokenCredential||!user||user.is_anonymous)return json({error:'Admin session required'},403);
   const principal=await sessionPrincipal(req.method==='GET'?'workspace:read':'workspace:write');if(principal.failure)return principal.failure;if(principal.role!=='owner')return json({error:'Workspace owner access required'},403);
   const id=memberMatch[1];if(id&&!UUID.test(id))return json({error:'Invalid member ID'},400);
   if(req.method==='GET'&&!id){
    const query=new URL(req.url).searchParams,offset=Number(query.get('offset')??0);if([...query.keys()].some(k=>k!=='offset')||!Number.isInteger(offset)||offset<0||offset>1e7)return json({error:'Invalid member page'},400);
    const {data,error}=await db.rpc('redirect_member_administration',{p_actor:user.id,p_action:'list',p_offset:offset});if(error)return rpcError(error);return json(data);
   }
   if(req.method==='DELETE'&&id){const {data,error}=await db.rpc('redirect_member_administration',{p_actor:user.id,p_action:'delete',p_id:id});if(error)return rpcError(error);return json(data);}
   if(req.method==='POST'&&!id||req.method==='PATCH'&&id){
    const body=await boundedJson(req),create=req.method==='POST',allowed=create?['label','role','active','kind','userId']:['label','role','active'];
    if(!body||typeof body!=='object'||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(k=>!allowed.includes(k)))return json({error:'Invalid membership fields'},400);
    if((create||body.label!==undefined)&&(typeof body.label!=='string'||!body.label.trim()||body.label.trim().length>100))return json({error:'Member label must be 1–100 characters'},400);
    if(body.role!==undefined&&!['member','viewer','billing'].includes(body.role)||body.active!==undefined&&typeof body.active!=='boolean')return json({error:'Invalid membership role or status'},400);
    if(create&&(!['user','machine'].includes(body.kind)||body.kind==='user'&&(typeof body.userId!=='string'||!UUID.test(body.userId))||body.kind==='machine'&&body.userId!=null))return json({error:'Choose an existing account UUID or a machine member'},400);
    const values={...(body.label!==undefined?{label:body.label.trim()}:{}),...(body.role!==undefined?{role:body.role}:{}),...(body.active!==undefined?{active:body.active}:{}),...(create?{kind:body.kind,user_id:body.kind==='user'?body.userId:null}:{})};
    const {data,error}=await db.rpc('redirect_member_administration',{p_actor:user.id,p_action:create?'create':'update',p_id:id??null,p_values:values});if(error)return rpcError(error);return json(data,create?201:200);
   }
   return json({error:'Method not supported'},405);
  }
  const accessMatch=path.match(/^\/folders\/([a-f0-9-]{36})\/access$/i);
  if(accessMatch){
   if(!UUID.test(accessMatch[1]))return json({error:'Invalid folder ID'},400);
   if(!['GET','PATCH'].includes(req.method))return json({error:'Method not supported'},405);
   const accessScope=req.method==='GET'?'workspace:read':'workspace:write';let principalId:string|null=null;
   if(tokenCredential){const {data,error}=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:accessScope});if(error)return json({error:'Credential verification unavailable'},503);if(!data||data.redirect_ids!==null)return json({error:'Unrestricted workspace scope is required'},403);principalId=data.id;}
   else{const principal=await sessionPrincipal(accessScope);if(principal.failure)return principal.failure;principalId=principal.id;}
   const values=req.method==='PATCH'?await boundedJson(req):null;
   if(req.method==='PATCH'&&(!values||typeof values!=='object'||Array.isArray(values)))return json({error:'Provide access settings'},400);
   const {data,error}=await db.rpc('redirect_folder_access',{p_folder:accessMatch[1],p_values:values,p_token_id:principalId});if(error)return rpcError(error);return json(data);
  }
  const resourceMatch=path.match(/^\/(folders|tags|templates)(?:\/([a-f0-9-]+))?$/i);
  if(resourceMatch){
   const [,kind,id]=resourceMatch, read=req.method==='GET';let tokenId:string|null=null;
   if(tokenCredential){const {data,error}=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:read?'workspace:read':'workspace:write'});if(error)return json({error:'Credential verification unavailable'},503);if(!data)return json({error:'Workspace scope is required'},403);if(data.redirect_ids!==null)return json({error:'Workspace permissions require an unrestricted credential'},403);tokenId=data.id;}
   else{const principal=await sessionPrincipal(read?'workspace:read':'workspace:write');if(principal.failure)return principal.failure;tokenId=principal.id;}
   if(id&&!UUID.test(id))return json({error:'Invalid resource ID'},400);
   let action:string,values:Record<string,unknown>={},limit=50,after:string|null=null;
   if(read&&!id){const query=new URL(req.url).searchParams;if([...query.keys()].some(key=>!['limit','cursor'].includes(key)))return json({error:'Unknown resource page parameter'},400);limit=Number(query.get('limit')??50);after=query.get('cursor');if(!Number.isInteger(limit)||limit<1||limit>100||after&&!UUID.test(after))return json({error:'Invalid resource page'},400);action='list';}
   else if(read&&id)action='get';
   else if(req.method==='POST'&&!id){action='create';values=workspaceInput(kind,await boundedJson(req),true);}
   else if(req.method==='PATCH'&&id){action='update';values=workspaceInput(kind,await boundedJson(req),false);}
   else if(req.method==='DELETE'&&id)action='delete';
   else return json({error:'Method not supported'},405);
   const {data,error}=await db.rpc('redirect_workspace_resource',{p_kind:kind,p_action:action,p_id:id??null,p_values:values,p_limit:limit,p_after:after,p_token_id:tokenId});if(error)return rpcError(error);return json(data,action==='create'?201:200);
  }
  if(path==='/links'||path.startsWith('/links/')) {
   const read=req.method==='GET', scope=read?'links:read':'links:write';
   let tokenId:string|null=null;
   if(tokenCredential){const {data,error}=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:scope});if(error)return json({error:'Credential verification unavailable'},503);if(!data)return json({error:'Required link scope is missing'},403);tokenId=data.id;}
   else{const principal=await sessionPrincipal(scope);if(principal.failure)return principal.failure;tokenId=principal.id;}
   const variants=path.match(/^\/links\/([a-f0-9-]{36})\/variants$/i);
   if(variants){if(req.method!=='GET')return json({error:'Method not supported'},405);if(!UUID.test(variants[1]))return json({error:'Invalid link ID'},400);const {data,error}=await db.rpc('redirect_scoped_variant_performance',{p_redirect_id:variants[1],p_token_id:tokenId});if(error)return rpcError(error);return json(data);}
   const policyMatch=path.match(/^\/links\/([a-f0-9-]{36})\/policy$/i);
   if(policyMatch){
    const linkId=policyMatch[1];if(!UUID.test(linkId))return json({error:'Invalid link ID'},400);
    if(req.method!=='GET'&&req.method!=='PATCH')return json({error:'Method not supported'},405);
    const input=req.method==='PATCH'?policyPatchInput(await boundedJson(req)):{patch:{},changePassword:false,password:null};
    let passwordHash=null;
    if(input.changePassword&&typeof input.password==='string'){
     const reserved=await db.rpc('reserve_redirect_policy_password',{p_redirect_id:linkId,p_token_id:tokenId,p_actor_id:user?.id??null});if(reserved.error)return rpcError(reserved.error);
     if(reserved.data)return new Response(JSON.stringify({error:'Password update limit reached'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(reserved.data)}});
     passwordHash=await hashLinkPassword(input.password);
    }
    const {data,error}=await db.rpc('redirect_policy_resource',{p_redirect_id:linkId,p_action:req.method==='GET'?'get':'patch',p_patch:input.patch,p_password_hash:passwordHash,p_change_password:input.changePassword,p_token_id:tokenId});if(error)return rpcError(error);return json(data);
   }
   const presentationMatch=path.match(/^\/links\/([a-f0-9-]{36})\/(presentation|preview-image|preview-generate)$/i);
   if(presentationMatch){
    const [,linkId,endpoint]=presentationMatch;if(!UUID.test(linkId))return json({error:'Invalid link ID'},400);
    if(endpoint==='preview-generate'&&req.method==='POST'){
     const access=await db.rpc('redirect_presentation',{p_redirect_id:linkId,p_action:'check',p_token_id:tokenId});if(access.error)return rpcError(access.error);
     const body=await boundedJson(req);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return json({error:'Generation accepts an empty object'},400);
     const apiKey=Deno.env.get('FIRECRAWL_API_KEY');
     if(!apiKey||(!isLlmConfigured()&&!Deno.env.get('NVIDIA_API_KEY'))||Deno.env.get('AI_DISABLED')==='1')return json({error:'Preview generation is not configured'},503);
     const reservation=await db.rpc('reserve_redirect_preview',{p_redirect_id:linkId,p_token_id:tokenId,p_actor_id:user?.id??null});if(reservation.error)return rpcError(reservation.error);
     if(reservation.data.retryAfter)return new Response(JSON.stringify({error:'Preview generation limit reached'}),{status:429,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':String(reservation.data.retryAfter)}});
     let draft;try{draft=await generateRedirectPreview(reservation.data.target,apiKey,linkId);}catch{return json({error:'Could not generate a preview from this destination. Try again later or enter it manually.'},503);}
     const checked=await db.rpc('redirect_presentation',{p_redirect_id:linkId,p_action:'check',p_token_id:tokenId});if(checked.error)return rpcError(checked.error);
     return json(draft);
    }
    if(endpoint==='preview-image'&&req.method==='POST'){
     const access=await db.rpc('redirect_presentation',{p_redirect_id:linkId,p_action:'check',p_token_id:tokenId});
     if(access.error)return rpcError(access.error);
     const body=await boundedJson(req,2100000);
     if(!body||Object.keys(body).some(key=>key!=='image')||typeof body.image!=='string'||body.image.length>2000000||!body.image.length||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.image))return json({error:'Provide a base64 PNG or JPG image'},400);
     const bytes=Uint8Array.from(atob(body.image),char=>char.charCodeAt(0)),info=previewImageInfo(bytes);
     if(info.width!==1200||info.height!==630)return json({error:'Preview artwork must be 1200 × 630 pixels'},400);
     const key=linkId+'/'+crypto.randomUUID()+'.'+info.extension,bucket=db.storage.from('redirect-previews');
     const {error:uploadError}=await bucket.upload(key,bytes,{contentType:info.mime,upsert:false,cacheControl:'3600'});if(uploadError)return json({error:'Image upload unavailable'},503);
     const image=bucket.getPublicUrl(key).data.publicUrl;
     const saved=await db.rpc('redirect_presentation',{p_redirect_id:linkId,p_action:'check',p_token_id:tokenId});
     if(saved.error){try{await bucket.remove([key]);}catch{/* Keep the primary authorization failure if asset cleanup is unavailable. */}return rpcError(saved.error);}return json({image,width:info.width,height:info.height},201);
    }
    if(endpoint==='presentation'&&(req.method==='GET'||req.method==='PATCH')){
     let values:Record<string,unknown>={};
     if(req.method==='PATCH'){
      const body=await boundedJson(req);if(!body||typeof body!=='object'||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(key=>!['preview','cloaked'].includes(key)))return json({error:'Invalid presentation fields'},400);
      const errors=policyErrors({...body,...(body.preview===null?{preview:undefined}:{})});if(errors.length)return json({error:errors.join('; ')},400);values=body;
     }
     const {data,error}=await db.rpc('redirect_presentation',{p_redirect_id:linkId,p_action:req.method==='GET'?'get':'patch',p_values:values,p_token_id:tokenId});if(error)return rpcError(error);return json(data);
    }
    return json({error:'Method not supported'},405);
   }
   const query=new URL(req.url).searchParams;
   if(new URL(req.url).search.length>16384)return json({error:'Filters are too large'},400);
   const id=path.slice('/links/'.length), byId=UUID.test(id);
   if(read&&(path==='/links'||path==='/links/count'||byId)) {
    if([...query.keys()].some(key=>!['filters','limit','cursor'].includes(key)))return json({error:'Unknown page parameter'},400);
    const filters=byId?{ids:[id]}:linkListInput(JSON.parse(query.get('filters')??'{}'));
    const count=path==='/links/count',limit=count?0:byId?1:Number(query.get('limit')??50),cursor=query.get('cursor');
    if(!Number.isInteger(limit)||limit<0||limit>100||!count&&limit===0||cursor&&!UUID.test(cursor))return json({error:'Invalid link page'},400);
    const {data,error}=await db.rpc('redirect_management_list',{p_filters:filters,p_limit:limit,p_after:byId?null:cursor,p_token_id:tokenId});
    if(error)return rpcError(error);
    if(byId)return data.data.length?json(data.data[0]):json({error:'Link not found'},404);
    return json(count?{count:data.count}:data);
   }
   let operations:unknown[];
   if(path==='/links/bulk'&&req.method==='POST')operations=bulkLinkInput(await boundedJson(req,2100000));
   else if(path==='/links'&&req.method==='POST')operations=[{operation:'create',data:linkInput(await boundedJson(req),'create')}];
   else if(path==='/links/upsert'&&req.method==='PUT')operations=[{operation:'upsert',data:linkInput(await boundedJson(req),'upsert')}];
   else if(byId&&req.method==='PATCH')operations=[{operation:'update',id,data:linkInput(await boundedJson(req),'update')}];
   else if(byId&&req.method==='DELETE')operations=[{operation:'delete',id}];
   else return json({error:'Method or endpoint not supported'},405);
   const {data,error}=await db.rpc('redirect_management_mutate',{p_operations:operations,p_token_id:tokenId,p_actor_id:user?.id??null});
   if(error)return rpcError(error);
   if(path==='/links/bulk')return json({data});
   return json(data[0],data[0]?.created?201:200);
  }
  if((path==='/analytics'||path==='/events')&&['GET','POST'].includes(req.method)) {
   const query=new URL(req.url).searchParams;
   if(new URL(req.url).search.length>16384)return json({error:'Filters are too large'},400);
   let tokenId:string|null=null;
   if(tokenCredential){const {data,error}=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:'events:read'});if(error)return json({error:'Credential verification unavailable'},503);if(!data)return json({error:'Read scope is required'},403);tokenId=data.id;}
   else{const principal=await sessionPrincipal('events:read');if(principal.failure)return principal.failure;tokenId=principal.id;}
   let body:Record<string,unknown>|null=null;
   if(req.method==='POST'){body=await boundedJson(req);if(!body||typeof body!=='object'||Array.isArray(body)||new URL(req.url).search||Object.keys(body).some(k=>!(path==='/events'?['filters','limit','snapshot','cursor']:['filters']).includes(k)))return json({error:'Invalid analytics body'},400);}
   if(body&&path==='/events'&&(body.snapshot!==undefined&&body.snapshot!==null&&typeof body.snapshot!=='string'||body.limit!==undefined&&typeof body.limit!=='number'))return json({error:'Invalid event page'},400);
   const filters=analyticsFilters(body?body.filters??{}:JSON.parse(query.get('filters')??'{}'));
   const name='redirect_scoped_analytics';let args:Record<string,unknown>={p_action:path==='/events'?'events':'report',p_filters:filters,p_token_id:tokenId};
   if(path==='/events'){
    const limit=Number(body?body.limit??50:query.get('limit')??50),snapshot=body?(typeof body.snapshot==='string'?body.snapshot:null):query.get('snapshot');
    // `Date.parse(String(x))` is behaviour-identical to the old untyped `Date.parse(x)`:
    // both coerce, and undefined/null/object all parse to NaN either way.
    const rawCursor=body?body.cursor??null:query.has('cursor')?JSON.parse(query.get('cursor')!):null;
    const cursor=rawCursor&&typeof rawCursor==='object'&&!Array.isArray(rawCursor)?rawCursor as {at?:unknown;id?:unknown}:null;
    if(!Number.isInteger(limit)||limit<1||limit>100||snapshot&&!Number.isFinite(Date.parse(snapshot))||rawCursor&&(!cursor||!Number.isFinite(Date.parse(String(cursor.at)))||typeof cursor.id!=='string'||cursor.id.length>100))return json({error:'Invalid event page'},400);
    args={...args,p_limit:limit,p_snapshot:snapshot,p_before_at:cursor?.at??null,p_before_id:cursor?.id??null};
   }
   const {data,error}=await db.rpc(name,args);if(error)return rpcError(error);return json(data);
  }
  if(path==='/native/signup' && req.method==='POST') {
   if(!user || user.is_anonymous || !(user.email_confirmed_at || user.confirmed_at)) return json({error:'A verified account is required'},403);
   const body=await boundedJson(req);
   if(!body || typeof body!=='object' || Object.keys(body).some(key=>key!=='clickId') || typeof body.clickId!=='string' || !UUID.test(body.clickId))return json({error:'Provide an attributed click ID'},400);
   const {data,error}=await db.rpc('record_redirect_signup',{p_user:user.id,p_click:body.clickId});
   if(error)return rpcError(error);
   return json(data,data.duplicate?200:201);
  }
  const kind=path==='/track/lead'?'lead':path==='/track/sale'?'sale':null;
  if(kind && req.method==='POST') {
   let tokenId:string|null=null;
   if(tokenCredential){
    const {data,error}=await db.rpc('authenticate_redirect_api_token',{p_hash:await tokenDigest(credential),p_scope:'conversions:write'});
    if(error)return json({error:'Credential verification unavailable'},503);
    if(!data)return json({error:'Credential expired, revoked, or missing conversion scope'},403);
    tokenId=data.id;
   }else{
    const principal=await sessionPrincipal('workspace:write');if(principal.failure)return principal.failure;if(principal.role!=='owner')return json({error:'Workspace owner access required'},403);
   }
   const event=conversionInput(await boundedJson(req),kind);
   const {data,error}=await db.rpc('record_redirect_conversion',{p_event:event,p_token_id:tokenId});
   if(error)return rpcError(error);
   return json(data,data.duplicate?200:201);
  }
  if(path==='/tokens' || /^\/tokens\/[a-f0-9-]+$/i.test(path)) {
   if(tokenCredential||user?.is_anonymous)return json({error:'Admin session required'},403);
   const principal=await sessionPrincipal(req.method==='GET'?'workspace:read':'workspace:write');if(principal.failure)return principal.failure;if(principal.role!=='owner')return json({error:'Workspace owner access required'},403);
   if(path==='/tokens' && req.method==='GET') {
    const offset=Number(new URL(req.url).searchParams.get('offset') ?? '0');
    if(!Number.isInteger(offset) || offset<0 || offset>1e7)return json({error:'Invalid page offset'},400);
    const {data,error}=await db.rpc('redirect_token_administration',{p_actor:user!.id,p_action:'list',p_offset:offset});
    if(error)return rpcError(error);
    return json(data);
   }
   if(path==='/tokens' && req.method==='POST') {
    const body=await boundedJson(req);
    if(!body || typeof body!=='object' || Object.keys(body).some(key=>!['name','expiresAt','redirectIds','scopes','memberId'].includes(key)) || typeof body.name!=='string' || !body.name.trim() || body.name.length>100)return json({error:'Provide a credential name (1–100 characters)'},400);
    const end=typeof body.expiresAt==='string'?Date.parse(body.expiresAt):NaN;
    if(!Number.isFinite(end) || end<=Date.now() || end>Date.now()+366*86400000)return json({error:'Credentials must expire within one year'},400);
    if(body.redirectIds!==undefined && (!Array.isArray(body.redirectIds) || body.redirectIds.length<1 || body.redirectIds.length>100 || body.redirectIds.some((id:unknown)=>typeof id!=='string' || !UUID.test(id))))return json({error:'Invalid link scope'},400);
    const scopes=body.scopes??['conversions:write'];
    if(!Array.isArray(scopes)||scopes.length<1||scopes.some(scope=>!LINK_SCOPES.includes(scope)))return json({error:'Invalid credential permissions'},400);
    const ids=body.redirectIds? [...new Set(body.redirectIds)] : null;
    if(ids&&scopes.some(scope=>scope.startsWith('workspace:')))return json({error:'Workspace permissions require an unrestricted credential'},400);
    if(body.memberId!==undefined&&(typeof body.memberId!=='string'||!UUID.test(body.memberId)))return json({error:'Invalid member binding'},400);
    const secret=createRedirectToken();
    const {data,error}=await db.rpc('redirect_token_administration',{p_actor:user!.id,p_action:'create',p_values:{name:body.name.trim(),token_hash:await tokenDigest(secret),prefix:secret.slice(0,20),scopes:[...new Set(scopes)],redirect_ids:ids,member_id:body.memberId??null,expires_at:new Date(end).toISOString()}});
    if(error)return rpcError(error);
    return json({...data,secret},201);
   }
   const id=path.slice('/tokens/'.length);
   if(req.method==='DELETE' && UUID.test(id)){
    const {data,error}=await db.rpc('redirect_token_administration',{p_actor:user!.id,p_action:'revoke',p_id:id});
    if(error)return rpcError(error);
    return json(data);
   }
   return json({error:'Method not allowed'},405);
  }
  return json({error:'Endpoint not found'},404);
 } catch(error){return json({error:error instanceof Error?error.message:'Invalid request'},400);}
});
