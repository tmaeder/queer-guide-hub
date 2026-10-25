import { verifyRedirectWorkspaceMembershipHttp } from './lib/redirect-workspace-fixtures.mjs';
import { getDomain } from 'tldts';
import { verifyRedirectIntegrationHttp } from './lib/redirect-integration-fixtures.mjs';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { createRedirectTestDb } from './lib/redirect-test-db.mjs';

const db = await createRedirectTestDb();
await db.exec('SET ROLE service_role; SET request.jwt.claims = \'{"role":"service_role"}\'');
let handler;
let policyRuntime;
let loseConversionOwnerAfterContext=false;
const pieces = [
  '_shared/redirect-api.ts',
  '_shared/redirect-workspace.ts',
  '_shared/redirect-inventory-manifest.ts',
  '_shared/redirect-inventory-api.ts',
  '_shared/redirect-native-apps.ts',
  '_shared/redirect-qr-style.ts',
  '_shared/redirect-domains.ts',
  '_shared/redirect-domain-connect.ts',
  '_shared/redirect-domain-discovery.ts',
  '_shared/redirect-domain-connect-api.ts',
  '_shared/email-gateway-receipt.ts',
  '_shared/cloudflare-email-gateway.ts',
  '_shared/redirect-domain-mail.ts',
  '_shared/redirect-domain-provider.ts',
  '_shared/redirect-presentation.ts',
  '_shared/redirect-qr-assets.ts',
  '_shared/redirect-password-branding.ts',
  '_shared/redirect-qr-images.ts',
  '_shared/link-policy.ts',
  '_shared/redirect-policy-api.ts',
  '_shared/redirect-links.ts',
  '_shared/redirect-manual-records.ts',
  '_shared/redirect-analytics.ts',
  '_shared/redirect-customers.ts',
  '_shared/redirect-webhook-transport.ts',
  '_shared/redirect-webhooks.ts',
  '_shared/redirect-relay.ts',
  '_shared/redirect-reports.ts',
  'redirect-api/index.ts',
].map((file) =>
  readFileSync('supabase/functions/' + file, 'utf8')
    .replace(/^import[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+/gm, ''),
);
const code = ts.transpileModule(pieces.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const jsonArgs = new Set(['p_result', 'p_dates', 'p_event', 'p_filters', 'p_manifest', 'p_values', 'p_operations','p_patch','p_password_hash']);
const artwork = await sharp({
  create: { width: 1200, height: 630, channels: 3, background: 'white' },
})
  .png()
  .toBuffer();
const uploadedArtwork = new Map();
const service = {
  storage: {
    from: () => ({
      upload: async (key, bytes, options) => {
        uploadedArtwork.set(key, { bytes, options });
        return { error: null };
      },
      getPublicUrl: (key) => ({
        data: {
          publicUrl:
            'https://fixture.supabase.co/storage/v1/object/public/redirect-previews/' + key,
        },
      }),
      remove: async (keys) => {
        for (const key of keys) uploadedArtwork.delete(key);
        return { error: null };
      },
    }),
  },
  rpc: async (name, args = {}, requestHeaders = {}) => {
    try {
      const entries = Object.entries(args);
      const params = entries.map(([key, value]) =>
        jsonArgs.has(key)
          ? JSON.stringify(value)
          : Array.isArray(value)
            ? '{' + value.join(',') + '}'
            : value,
      );
      const sql =
        "WITH context AS MATERIALIZED(SELECT set_config('request.headers',$" + (params.length+1) + ',true)) SELECT public.' +
        name +
        '(' +
        entries.map(([key], index) => key + '=> $' + (index + 1)).join(',') +
        ') AS result FROM context';
      const result = await db.query(sql, [...params, JSON.stringify(requestHeaders)]);
      if(name==='redirect_workspace_context'&&args.p_scope==='workspace:write'&&loseConversionOwnerAfterContext){loseConversionOwnerAfterContext=false;await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportActor]);}
      if(name==='redirect_policy_resource'&&args.p_change_password===true&&args.p_password_hash){
        const stored=(await db.query('SELECT password_hash FROM public.redirect_link_policies WHERE redirect_id=$1',[args.p_redirect_id])).rows[0].password_hash;
        if(!await policyRuntime.verifyLinkPassword('fixture-sdk-password',stored))throw new Error('Persisted SDK password hash did not verify');
      }
      return { data: result.rows[0].result, error: null };
    } catch (error) {
      return { data: null, error: { code: error.code, message: error.message } };
    }
  },
};
const reportActor='00000000-0000-4000-8000-000000000099';
await db.query('INSERT INTO auth.users(id) VALUES($1)',[reportActor]);
await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[reportActor]);
const sdkRootDomain=webcrypto.randomUUID();
await db.query("INSERT INTO public.redirect_domains(id,hostname,verification_token,ownership_state,verified_at,verified_until,provider_id,routing_provider_id,routing_protocol,routing_seen_at) VALUES($1,'root-sdk.example.com',repeat('a',64),'verified',now(),now()+interval '1 day','fixture-root-provider','fixture-root-provider',1,now())",[sdkRootDomain]);
await db.query("INSERT INTO public.redirect_domain_jobs(domain_id,zone_id,cname_target,requested_by,state,provider_status,ssl_status,checked_at) VALUES($1,repeat('a',32),'links.queer.guide',$2,'ready','active','active',now())",[sdkRootDomain,reportActor]);
const reportOtherActor='00000000-0000-4000-8000-000000000098';
await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'http-invite@example.org',now())",[reportOtherActor]);
await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[reportOtherActor]);
const identity={auth:{getUser:async(value)=>({data:{user:['fixture-account-session','fixture-other-account-session'].includes(value)?{id:value==='fixture-account-session'?reportActor:reportOtherActor,created_at:'2026-10-01T00:00:00Z',is_anonymous:false}:null},error:null})},rpc:async()=>({data:true,error:null})};
let dnsCalls=0,dnsMissing=false;
const domainConnectKey = await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const domainConnectJwk = JSON.stringify(await webcrypto.subtle.exportKey('jwk',domainConnectKey.privateKey));
async function instructionIdentity(id){const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('qg-domain-instructions/v1/'+id))).toString('hex');return `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;}
let instructionMailEnabled=false,instructionMailCalls=0,instructionMailMode='accepted',instructionMailLoseOwner=false;
const instructionMailMessages=new Map();
let domainConnectEnabled=false,domainConnectTemplateMissing=false,domainConnectLoseOwner=false,domainConnectDnsCalls=0;
const providerConfig={zoneId:'a'.repeat(32),token:'fixture-provider-token',cnameTarget:'links.queer.guide'};
const providerObjects=new Map();let providerCreates=0,providerDeletes=0,providerRestarts=0;
const logoObjects=new Map();let logoUploads=0,logoDeletes=0,loseLogoReceipt=false,revokeLogoOwner=false;
let artworkVerifierPromise,artworkVerifierRuntime;let failArtworkVerification=false;
async function verifyArtworkFixture(request) {
 if(failArtworkVerification)return new Response(null,{status:503});
 artworkVerifierPromise??=(async()=>{
  const {register}=await import('tsx/esm/api');artworkVerifierRuntime=register({namespace:'qr-artwork-verifier-fixture'});
  const [{qrImageResponse},{initWasm}]=await Promise.all([artworkVerifierRuntime.import('../workers/redirect-qr/handler.ts',import.meta.url),artworkVerifierRuntime.import('@resvg/resvg-wasm',import.meta.url)]);
  await initWasm(readFileSync('node_modules/@resvg/resvg-wasm/index_bg.wasm'));return qrImageResponse;
 })();
 const render=await artworkVerifierPromise;
 return render(request,'https://fixture.supabase.co',async()=>true,async()=>{},async()=>{throw new Error('Artwork verifier attempted an external fetch');});
}
let fixtureExternalRequests=0;
const fixtureDnsFetch=async (input,options)=>{const url=new URL(String(input));fixtureExternalRequests++;
if(url.origin==='https://email-gateway.fixture.invalid'){
 if(url.pathname!=='/send'||options.method!=='POST'||options.redirect!=='error'||new Headers(options.headers).get('Authorization')!=='Bearer fixture-mail-provider')throw new Error('Unexpected instruction email transport');
 const message=JSON.parse(options.body),messageId=message.id;if(!/^[a-f0-9-]{36}$/.test(messageId)||message.category!=='transactional'||typeof message.to!=='string')throw new Error('Missing native gateway identity or transactional recipient');
 instructionMailCalls++;
 if(instructionMailMode==='throttled')return Response.json({name:'rate_limit'},{status:429,headers:{'Retry-After':'60'}});
 if(instructionMailMode==='rejected')return Response.json({name:'validation_error'},{status:422});
 const previous=instructionMailMessages.get(messageId);
 if(previous&&previous.body!==options.body)throw new Error('Retry changed provider message bytes');
 if(!previous)instructionMailMessages.set(messageId,{body:options.body,id:webcrypto.randomUUID()});
 if(instructionMailLoseOwner){instructionMailLoseOwner=false;await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportActor]);}
 if(instructionMailMode==='lost-receipt'){instructionMailMode='accepted';throw new TypeError('Provider receipt lost after acceptance');}
 return Response.json({status:'accepted',id:instructionMailMessages.get(messageId).id});
}

if(url.origin==='https://queer.guide'&&url.pathname==='/api/qr'){if(options.method!=='POST'||new Headers(options.headers).has('Authorization'))throw new Error('Invalid artwork verification request');return verifyArtworkFixture(new Request(url,options));}
if(url.origin==='https://fixture.supabase.co'&&url.pathname.startsWith('/storage/v1/object/redirect-brand-assets')){
 const headers=new Headers(options?.headers);if(headers.get('Authorization')!=='Bearer fixture-service'||headers.get('apikey')!=='fixture-service')throw new Error('Wrong Storage credentials');
 if(options.method==='POST'){
  const key=url.pathname.split('/redirect-brand-assets/')[1];if(!/^[a-f0-9-]{36}\.(png|jpg)$/.test(key)||headers.get('x-upsert')!=='false'||logoObjects.has(key))throw new Error('Invalid or repeated logo upload');
  logoUploads++;logoObjects.set(key,{bytes:new Uint8Array(options.body),mime:headers.get('Content-Type')});
  if(revokeLogoOwner){revokeLogoOwner=false;await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportActor]);}
  if(loseLogoReceipt){loseLogoReceipt=false;throw new Error('Lost upload receipt');}
  return Response.json({Id:webcrypto.randomUUID(),Key:'redirect-brand-assets/'+key});
 }
 if(options.method==='DELETE'){
  const {prefixes}=JSON.parse(options.body);if(prefixes.length!==1||!/^[a-f0-9-]{36}\.(png|jpg)$/.test(prefixes[0]))throw new Error('Invalid cleanup key');
  logoDeletes++;const exists=logoObjects.delete(prefixes[0]);return Response.json(exists?[{name:prefixes[0]}]:[]);
 }
 throw new Error('Unexpected Storage operation');
}
if(url.origin==='https://api.cloudflare.com'&&url.pathname.startsWith('/client/v4/dns/domainconnect/')){
 if(new Headers(options?.headers).has('Authorization'))throw new Error('Platform DNS credential leaked to Domain Connect');
 if(domainConnectLoseOwner){domainConnectLoseOwner=false;await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportActor]);}
 if(url.pathname.endsWith('/settings'))return Response.json({providerId:'cloudflare.com',urlAPI:'https://api.cloudflare.com/client/v4/dns/domainconnect',urlSyncUX:'https://dash.cloudflare.com/domainconnect'});
 return new Response('',{status:domainConnectTemplateMissing?404:200});
}
if(url.origin==='https://cloudflare-dns.com'&&(url.searchParams.get('type')==='2'||url.searchParams.get('name')==='_domainconnect.setup-example.com')){
 domainConnectDnsCalls++;const name=url.searchParams.get('name'),type=Number(url.searchParams.get('type'));
 return new Response(JSON.stringify({Status:0,TC:false,Question:[{name,type}],Answer:type===2?(name==='setup-example.com'?[{name,type:2,data:'ns1.cloudflare.com.'}]:[]):[{name,type:16,data:'"api.cloudflare.com/client/v4/dns/domainconnect"'}]}),{headers:{'Content-Type':'application/dns-json'}});
}
if(url.origin==='https://api.cloudflare.com'){
 if(new Headers(options?.headers).get('Authorization')!=='Bearer '+providerConfig.token||!url.pathname.startsWith('/client/v4/zones/'+providerConfig.zoneId+'/custom_hostnames'))throw new Error('Invalid fixture provider credentials/zone');
 const method=options?.method??'GET',tail=url.pathname.split('/custom_hostnames')[1];
 if(method==='POST'&&!tail){providerCreates++;const body=JSON.parse(options.body),item={id:webcrypto.randomUUID(),hostname:body.hostname,status:'active',ssl:{type:'dv',method:'txt',status:'pending_validation',validation_records:[{txt_name:'_acme-challenge.'+body.hostname,txt_value:'fixture-validation'}]}};providerObjects.set(item.id,item);return Response.json({success:true,result:item});}
 if(method==='GET'&&!tail)return Response.json({success:true,result:[...providerObjects.values()].filter(item=>item.hostname===url.searchParams.get('hostname'))});
 const item=providerObjects.get(tail.slice(1));if(!item)return Response.json({success:false},{status:404});
 if(method==='PATCH'){const body=JSON.parse(options.body);if(JSON.stringify(body)!==JSON.stringify({ssl:{type:item.ssl.type,method:item.ssl.method}}))throw new Error('Restart changed provider SSL settings');providerRestarts++;item.ssl.status='pending_validation';return Response.json({success:true,result:item});}
 if(method==='DELETE'){providerDeletes++;providerObjects.delete(item.id);return Response.json({success:true,result:{id:item.id}});}
 return Response.json({success:true,result:item});
}
if(url.origin!=='https://cloudflare-dns.com'||url.pathname!=='/dns-query')throw new Error('Unexpected external fixture request');dnsCalls++;const hostname=url.searchParams.get('name').replace(/^_qg-redirect\./,'');const row=(await db.query('SELECT verification_token FROM public.redirect_domains WHERE hostname=$1',[hostname])).rows[0];return new Response(JSON.stringify({Status:0,Question:[{name:url.searchParams.get('name'),type:16}],Answer:row&&!dnsMissing?[{name:url.searchParams.get('name'),type:16,data:'\"qg-redirect='+row.verification_token+'\"'}]:[]}),{headers:{'Content-Type':'application/dns-json'}});};
policyRuntime=new Function('Deno', 'createClient', 'crypto', 'fetch', 'getDomain', code+'\nreturn {hashLinkPassword,verifyLinkPassword,dispatchRedirectDomainJobs,dispatchRedirectQrAssetCleanup,qrAssetStorageConfig,dispatchDomainInstructionMail,domainInstructionMailConfig};')(
  {
    env: { get: (key) => key==='SUPABASE_URL'?'https://fixture.supabase.co':key==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-service':key==='SUPABASE_ANON_KEY'?'fixture-anon':key==='REDIRECT_CF_ZONE_ID'?providerConfig.zoneId:key==='REDIRECT_CF_API_TOKEN'?providerConfig.token:key==='REDIRECT_CNAME_TARGET'?providerConfig.cnameTarget:key==='REDIRECT_DOMAIN_EMAIL_FROM'?(instructionMailEnabled?'Queer Guide <noreply@queer.guide>':''):key==='EMAIL_GATEWAY_SECRET'?'fixture-mail-provider':key==='EMAIL_GATEWAY_URL'?'https://email-gateway.fixture.invalid':key==='REDIRECT_DOMAIN_CONNECT_PRIVATE_JWK'?(domainConnectEnabled?domainConnectJwk:''):key==='REDIRECT_DOMAIN_CONNECT_KEY_LABEL'?'_fixture':'fixture' },
    serve: (fn) => {
      handler = fn;
    },
  },
  (_url,key,options) => key==='fixture-service'?{...service,rpc:(name,args)=>service.rpc(name,args,options?.global?.headers??{})}:identity,
  webcrypto,
  fixtureDnsFetch,
  getDomain,
);
const token = 'qg_redirect_' + 'a'.repeat(64);
const digest = Buffer.from(
  await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
).toString('hex');
await db.query(
  "INSERT INTO public.redirect_api_tokens(name,token_hash,prefix,scopes,created_by,expires_at) VALUES('SDK fixture',$1,'fixture',ARRAY['links:read','links:write','workspace:read','workspace:write','conversions:write','events:read'],$2,now()+interval '1 day')",
  [digest,reportActor],
);
const seed = await db.query(
  "INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','sdk-attribution','/events') RETURNING id",
);
const click = await db.query(
  "SELECT public.record_redirect_visit($1,'/go/sdk-attribution',NULL,NULL,'Fixture','CH',NULL,302,NULL,'/events','{\"device\":\"desktop\"}'::jsonb) AS id",
  [seed.rows[0].id],
);
await db.exec(
  "INSERT INTO public.redirects(type,slug,target) SELECT 'SHORT','sdk-page-'||seq,'/events' FROM generate_series(1,101) AS fixtures(seq)",
);
let traps = 0,
  limited = 0;
let sdkHeartbeatEnabled=false;
async function refreshSdkRootDomain(){
  await db.query("UPDATE public.redirect_domains SET verified_until=clock_timestamp()+interval '1 day',routing_seen_at=clock_timestamp() WHERE id=$1",[sdkRootDomain]);
  await db.query('UPDATE public.redirect_domain_jobs SET checked_at=clock_timestamp() WHERE domain_id=$1',[sdkRootDomain]);
}
const server = createServer(async (req, res) => {
  try {
    if(sdkHeartbeatEnabled)await refreshSdkRootDomain();
    if (req.url === '/api/redirects/redirect-probe') {
      res.writeHead(302, { Location: '/trap' });
      res.end();
      return;
    }
    if (req.url === '/trap') {
      traps++;
      res.writeHead(200);
      res.end('{}');
      return;
    }
    if (req.url === '/api/redirects/limited-probe') {
      limited++;
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '17' });
      res.end('{"error":"Fixture rate limit"}');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await handler(
      new Request(
        'http://fixture/functions/v1/redirect-api' + req.url.slice('/api/redirects'.length),
        {
          method: req.method,
          headers: req.headers,
          ...(['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
        },
      ),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/api/redirects';
const env = {
  ...process.env,
  REDIRECT_TEST_SESSION: 'fixture-account-session',
  REDIRECT_TEST_WORKSPACE: '58aa4340-8f21-4b7f-9a10-90be2da89c01',
  REDIRECT_TEST_OTHER_SESSION: 'fixture-other-account-session',
  REDIRECT_TEST_REPORT_LINK: seed.rows[0].id,
  REDIRECT_TEST_ROOT_DOMAIN: sdkRootDomain,
  REDIRECT_TEST_BASE: base,
  REDIRECT_TEST_TOKEN: token,
  REDIRECT_TEST_CLICK: click.rows[0].id,
  REDIRECT_TEST_IMAGE: artwork.toString('base64'),
  REDIRECT_TEST_QR_LOGO:(await sharp({create:{width:64,height:64,channels:3,background:'#652895'}}).png().toBuffer()).toString('base64'),
};
async function run(command, args, extra = {}) {
  // Positive SDK examples have a simulated provider heartbeat, including after
  // long compilation or host suspension mid-child. Later expiry tests opt out.
  await refreshSdkRootDomain();
  sdkHeartbeatEnabled=true;
  try {await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, ...extra, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('exit', async (code) => {
      if(code===0){resolve();return;}
      let diagnostic;
      try {
        diagnostic=(await db.query(`SELECT clock_timestamp() AS observed_at,d.workspace_id,d.archived,d.disabled,d.provider_id,d.ownership_state,d.verified_until,d.routing_seen_at,d.routing_protocol,d.routing_provider_id,j.state,j.desired,j.provider_status,j.ssl_status,j.checked_at,EXISTS(SELECT FROM public.user_roles WHERE user_id=j.requested_by AND role='admin') AS current_owner FROM public.redirect_domains d LEFT JOIN public.redirect_domain_jobs j ON j.domain_id=d.id AND j.workspace_id=d.workspace_id WHERE d.id=$1`,[sdkRootDomain])).rows;
      } catch { /* Preserve the original child failure when diagnostics are unavailable. */ }
      reject(new Error(command+' failed: '+output+(diagnostic?'\nReady-domain fixture: '+JSON.stringify(diagnostic):'')));
    });
  });}finally{sdkHeartbeatEnabled=false;}
  console.log(command + ' SDK: live HTTP → actual edge handler → isolated PostgreSQL passed');
}
try {
  // Runnable examples import the real package output; a clean checkout has no dist.
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'sdk/redirects/typescript/tsconfig.json'], { stdio: 'pipe' });
  mkdirSync('tmp/sdk-tests', { recursive: true });
  const compiled = ts.transpileModule(readFileSync('sdk/redirects/typescript/index.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  writeFileSync('tmp/sdk-tests/typescript.mjs', compiled);
  writeFileSync('tmp/sdk-tests/webhooks.js',ts.transpileModule(readFileSync('sdk/redirects/typescript/webhooks.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
  writeFileSync('tmp/sdk-tests/package.json',JSON.stringify({type:'module'}));
  await run(process.execPath, ['sdk/redirects/tests/typescript.mjs']);
  await run('python3', ['sdk/redirects/tests/python.py']);
  await run('ruby', ['sdk/redirects/tests/ruby.rb']);
  await run('php', ['sdk/redirects/tests/php.php']);
  await run(process.env.REDIRECT_GO_BIN ?? 'go', ['test', './...'], { cwd: 'sdk/redirects/go' });
  const leftoverReports=await db.query('SELECT count(*)::int AS count FROM public.redirect_saved_reports');
  if(leftoverReports.rows[0].count!==0)throw new Error('SDK report records were not cleaned');
  const sdkArtworkStorage=policyRuntime.qrAssetStorageConfig('https://fixture.supabase.co','fixture-service');
  await db.query("UPDATE public.redirect_qr_assets a SET next_cleanup_at=now()-interval '1 second' WHERE state='active' AND NOT EXISTS(SELECT FROM public.redirect_qr_styles WHERE logo_asset_id=a.id) AND NOT EXISTS(SELECT FROM public.redirect_qr_image_links WHERE logo_asset_id=a.id) AND NOT EXISTS(SELECT FROM public.redirect_password_branding WHERE logo_asset_id=a.id)");
  for(let sdkCleanup=0;sdkCleanup<8&&logoObjects.size;sdkCleanup++)await policyRuntime.dispatchRedirectQrAssetCleanup(service,sdkArtworkStorage,fixtureDnsFetch);
  if(logoObjects.size)throw new Error('Released SDK artwork was not physically cleaned');
  await db.query('DELETE FROM public.redirect_domain_jobs WHERE domain_id=$1',[sdkRootDomain]);
  await db.query('DELETE FROM public.redirect_domains WHERE id=$1',[sdkRootDomain]);
  if (traps !== 0 || limited !== 5)
    throw new Error('SDK followed a redirect or retried a throttled request');
  const result = await db.query(
    "SELECT count(*)::int AS leads FROM public.redirect_link_conversions WHERE kind='lead'",
  );
  if (result.rows[0].leads !== 5)
    throw new Error('Conversion retry deduplication failed across SDKs');
  const money = await db.query(
    "SELECT count(*)::int AS sales,sum(amount)::text AS total FROM public.redirect_link_conversions WHERE kind='sale'",
  );
  if (money.rows[0].sales !== 5 || money.rows[0].total !== '249.500005')
    throw new Error('SDK decimal revenue was altered');
  const examples = [
    [process.execPath, ['sdk/redirects/typescript/example.mjs'], 'typescript', {}],
    ['python3', ['sdk/redirects/python/example.py'], 'python', {}],
    ['ruby', ['sdk/redirects/ruby/example.rb'], 'ruby', {}],
    ['php', ['sdk/redirects/php/example.php'], 'php', {}],
    [
      process.env.REDIRECT_GO_BIN ?? 'go',
      ['run', './cmd/example'],
      'go',
      { cwd: 'sdk/redirects/go' },
    ],
  ];
  for (const [command, args, language, options] of examples)
    await run(command, args, {
      ...options,
      env: {
        ...env,
        REDIRECT_API_TOKEN: token,
        REDIRECT_API_BASE: base,
        REDIRECT_TARGET: '/events',
        REDIRECT_CLICK_ID: click.rows[0].id,
        REDIRECT_CUSTOMER_ID: 'example:' + language,
        REDIRECT_EVENT_ID: 'example:' + language,
        REDIRECT_AMOUNT: '1.000001',
        REDIRECT_CURRENCY: 'CHF',
      },
    });
  const exampleTotals = await db.query(
    "SELECT count(*)::int AS sales,sum(amount)::text AS total FROM public.redirect_link_conversions WHERE kind='sale'",
  );
  if (exampleTotals.rows[0].sales !== 10 || exampleTotals.rows[0].total !== '254.500010')
    throw new Error('Runnable SDK examples lost sale attribution');
  async function reportRequest(path,method='GET',body,credential='fixture-account-session',expected=200){
    const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+credential,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(response.status!==expected)throw new Error('Report HTTP '+path+' expected '+expected+' received '+response.status+': '+JSON.stringify(data));return data;
  }
  const {verifyPublicCapabilityWorkspaces}=await import('./lib/redirect-public-capability-fixture.mjs');
  await verifyPublicCapabilityWorkspaces(db,reportRequest,base,policyRuntime.hashLinkPassword);
  const workspaceFixtureConfig={domainConnectEnabled,instructionMailEnabled,sdkHeartbeatEnabled},workspaceFixtureRequests=fixtureExternalRequests;
  domainConnectEnabled=true;instructionMailEnabled=true;sdkHeartbeatEnabled=true;
  try {await verifyRedirectWorkspaceMembershipHttp(db,reportRequest,reportActor,{cleanupAssets:(assetId)=>{
   if(fixtureExternalRequests!==workspaceFixtureRequests)throw new Error('Denied workspace requests reached external transport');
   return policyRuntime.dispatchRedirectQrAssetCleanup(service,sdkArtworkStorage,async(input,options)=>{
    if(String(input)!=='https://fixture.supabase.co/storage/v1/object/redirect-brand-assets'||options.method!=='DELETE'||JSON.stringify(JSON.parse(options.body).prefixes)!==JSON.stringify([assetId+'.png']))throw new Error('Workspace retention touched an unexpected object or transport');
    return fixtureDnsFetch(input,options);
   });
  }});}
  finally {domainConnectEnabled=workspaceFixtureConfig.domainConnectEnabled;instructionMailEnabled=workspaceFixtureConfig.instructionMailEnabled;sdkHeartbeatEnabled=workspaceFixtureConfig.sdkHeartbeatEnabled;}
  if(fixtureExternalRequests!==workspaceFixtureRequests+1)throw new Error('Workspace boundary fixture did not perform exactly its one authorized orphan cleanup');
  const lostRoleEvent='owner-context-race:'+webcrypto.randomUUID();
  loseConversionOwnerAfterContext=true;
  await reportRequest('/track/lead','POST',{clickId:click.rows[0].id,customerExternalId:'owner-context-race',eventId:lostRoleEvent},undefined,403);
  if((await db.query('SELECT id FROM public.redirect_link_conversions WHERE provider_event_id=$1',[lostRoleEvent])).rows.length)throw new Error('Manual conversion ignored owner loss after context check');
  await db.query("INSERT INTO public.user_roles VALUES($1,'admin')",[reportActor]);
  const legacyWorkspace='58aa4340-8f21-4b7f-9a10-90be2da89c01';
  const workspaceList=await reportRequest('/workspaces');
  if(workspaceList.data.length!==1||workspaceList.currentWorkspaceId!==legacyWorkspace||workspaceList.data[0].role!=='owner'||(await reportRequest('/session')).workspace.id!==legacyWorkspace)throw new Error('Durable owner workspace context missing');
  await reportRequest('/workspaces','GET',undefined,token,403);
  await reportRequest('/workspaces?unexpected=true','GET',undefined,undefined,400);
  const foldersBeforeWorkspaceSelection=(await db.query('SELECT count(*)::int AS n FROM public.redirect_link_folders')).rows[0].n;
  for(const [selected,status] of [[legacyWorkspace.toUpperCase(),201],['00000000-0000-4000-8000-000000000777',403],['',400],[legacyWorkspace+','+legacyWorkspace,400]]){
   const response=await fetch(base+'/folders',{method:'POST',headers:{Authorization:'Bearer fixture-account-session','Content-Type':'application/json','X-Qg-Redirect-Workspace':selected},body:JSON.stringify({name:'Explicit workspace HTTP'})});
   if(response.status!==status)throw new Error('Workspace selection was ignored or falsely authorized');
   if(status===201){const created=await response.json();await reportRequest('/folders/'+created.id,'DELETE');}
  }
  if((await db.query('SELECT count(*)::int AS n FROM public.redirect_link_folders')).rows[0].n!==foldersBeforeWorkspaceSelection)throw new Error('Denied workspace selection performed a mutation');
  // Fresh account membership metadata comes from SQL, not stale admin claims.
  await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportOtherActor]);
  const discoveryMember=(await db.query("INSERT INTO public.redirect_workspace_members(user_id,kind,label,role) VALUES($1,'user','HTTP viewer','viewer') RETURNING id",[reportOtherActor])).rows[0].id;
  const viewerWorkspaces=await reportRequest('/workspaces','GET',undefined,'fixture-other-account-session');
  if(viewerWorkspaces.data[0].role!=='viewer')throw new Error('Stale admin claim overrode current workspace membership');
  const {verifyBillingAndTagHttp}=await import('./lib/redirect-billing-http-fixture.mjs');
  await verifyBillingAndTagHttp(db,reportRequest,discoveryMember);
  await db.query('UPDATE public.redirect_workspace_members SET active=false WHERE id=$1',[discoveryMember]);
  await reportRequest('/workspaces','GET',undefined,'fixture-other-account-session',403);
  await db.query('DELETE FROM public.redirect_workspace_members WHERE id=$1',[discoveryMember]);
  await db.query("INSERT INTO public.user_roles VALUES($1,'admin')",[reportOtherActor]);
  console.log('Workspace identity: owner/member current-role discovery, immutable legacy selection, unsupported/empty/duplicate selector preflight denial and no wrong-workspace mutation pass.');
  await reportRequest('/apps','POST',{label:'Wrong Clip parent',platform:'ios',appId:'ABCDE12345.org.example.http',appClipId:'OTHER12345.org.other.Clip',paths:['/go/*']},undefined,400);
  const nativeApp=await reportRequest('/apps','POST',{label:'HTTP native app',platform:'ios',appId:'ABCDE12345.org.example.http',appClipId:'ABCDE12345.org.example.http.Clip',paths:['/go/*']},undefined,201);
  if(nativeApp.enabled||!nativeApp.version)throw new Error('Native app was not disabled by default');
  let activeNativeApp=await reportRequest('/apps/'+nativeApp.id,'PATCH',{version:nativeApp.version,enabled:true});
  await reportRequest('/apps/'+nativeApp.id,'PATCH',{version:nativeApp.version,label:'stale'},undefined,409);
  await reportRequest('/apps/'+nativeApp.id,'PATCH',{version:activeNativeApp.version,handoffEnabled:true},undefined,400);
  await reportRequest('/apps/'+nativeApp.id,'PATCH',{version:activeNativeApp.version,publicName:true},undefined,400);
  activeNativeApp=await reportRequest('/apps/'+nativeApp.id,'PATCH',{version:activeNativeApp.version,publicName:'HTTP public app',storeId:'1234567890',appGroupId:'group.org.example.http',handoffEnabled:true});
  if(!activeNativeApp.handoffEnabled||activeNativeApp.publicName!=='HTTP public app'||activeNativeApp.label!=='HTTP native app')throw new Error('Install setup changed private label or lost opt-in');
  const installChoices=(await db.query("SELECT public.redirect_native_install_choices('queer.guide','/go/http-test') AS value")).rows[0].value;
  if(installChoices.length!==1||installChoices[0].displayName!=='HTTP public app'||installChoices[0].storeUrl!=='https://apps.apple.com/app/id1234567890'||JSON.stringify(installChoices).includes('HTTP native app')||JSON.stringify(installChoices).includes('group.org.example.http'))throw new Error('Install choices leaked private setup or lost public identity');
  const aasa=await reportRequest('/public-app-association?hostname=queer.guide&platform=ios');
  if(!aasa.applinks.details.some(item=>item.appIDs.includes('ABCDE12345.org.example.http'))||!aasa.appclips?.apps.includes('ABCDE12345.org.example.http.Clip')||JSON.stringify(aasa).includes('HTTP native app'))throw new Error('Public iOS association projection failed');
  await reportRequest('/apps','GET',undefined,token,403);
  let androidNativeApp=await reportRequest('/apps','POST',{label:'HTTP Android app',platform:'android',appId:'org.example.http',fingerprints:['a'.repeat(64)],paths:['/go/*'],enabled:true},undefined,201);
  await reportRequest('/apps/'+androidNativeApp.id,'PATCH',{version:androidNativeApp.version,appClipId:'ABCDE12345.org.example.http.Clip'},undefined,400);
  await reportRequest('/apps/'+androidNativeApp.id,'PATCH',{version:androidNativeApp.version,storeId:'org.other.package'},undefined,400);
  androidNativeApp=await reportRequest('/apps/'+androidNativeApp.id,'PATCH',{version:androidNativeApp.version,publicName:'HTTP Android public',storeId:'org.example.http',handoffEnabled:true});
  const assetlinks=await reportRequest('/public-app-association?hostname=www.queer.guide&platform=android');
  if(assetlinks[0].target.sha256_cert_fingerprints[0]!==Array(32).fill('AA').join(':')||assetlinks[0].relation[0]!=='delegate_permission/common.handle_all_urls')throw new Error('Android fingerprints/permission changed');
  const invitationReceipt=await reportRequest('/invitations','POST',{email:'http-invite@example.org',label:'HTTP recipient',role:'viewer'},undefined,201);
  const invitationSecret=new URL(invitationReceipt.invitationUrl).hash.slice('#invite='.length);
  if(!/^qg_invite_[a-f0-9]{64}$/.test(invitationSecret))throw new Error('Invitation secret shape');
  const invitationList=await reportRequest('/invitations');
  if(JSON.stringify(invitationList).includes(invitationSecret)||invitationList.data.some(item=>item.token_hash))throw new Error('Invitation listing leaked secret');
  await reportRequest('/invitations/accept','POST',{token:invitationSecret},undefined,404);
  await reportRequest('/invitations','GET',undefined,token,403);
  const receivedInvites=await reportRequest('/invitations/received?offset=0','GET',undefined,'fixture-other-account-session');
  if(receivedInvites.count!==1||receivedInvites.data[0].id!==invitationReceipt.id||JSON.stringify(receivedInvites).includes(invitationSecret)||receivedInvites.data.some(item=>item.email||item.token_hash))throw new Error('Recipient invitation inbox projection failed');
  await reportRequest('/invitations/accept','POST',{id:invitationReceipt.id},undefined,404);
  const acceptedInvite=await reportRequest('/invitations/accept','POST',{id:invitationReceipt.id},'fixture-other-account-session');
  if((await reportRequest('/invitations/received','GET',undefined,'fixture-other-account-session')).count!==0)throw new Error('Accepted invite remained pending');
  const replayInvite=await reportRequest('/invitations/accept','POST',{token:invitationSecret},'fixture-other-account-session');
  if(acceptedInvite.memberId!==replayInvite.memberId||acceptedInvite.role!=='viewer')throw new Error('Invitation acceptance/replay failed');
  const revokedInvite=await reportRequest('/invitations','POST',{email:'http-invite@example.org',label:'Revoked',role:'member'},undefined,201);
  await reportRequest('/invitations/'+revokedInvite.id,'DELETE');
  await reportRequest('/invitations/accept','POST',{token:new URL(revokedInvite.invitationUrl).hash.slice('#invite='.length)},'fixture-other-account-session',404);
  const managedMember=await reportRequest('/members','POST',{label:'HTTP machine',kind:'machine',role:'viewer'},undefined,201);
  if(managedMember.kind!=='machine'||managedMember.user_id!==null)throw new Error('Membership creation response changed');
  const memberPage=await reportRequest('/members?offset=0');
  if(!memberPage.data.some(row=>row.id===managedMember.id)||memberPage.count<1)throw new Error('Membership listing failed');
  await reportRequest('/members','GET',undefined,token,403);
  await reportRequest('/members/'+managedMember.id,'PATCH',{active:false});
  await reportRequest('/members/'+managedMember.id,'PATCH',{userId:reportOtherActor},undefined,400);
  const ownerCredential=await reportRequest('/tokens','POST',{name:'HTTP current owner',expiresAt:new Date(Date.now()+86400000).toISOString(),scopes:['links:read']},undefined,201);
  if(!/^qg_redirect_[a-f0-9]{64}$/.test(ownerCredential.secret)||ownerCredential.token_hash||ownerCredential.prefix!==ownerCredential.secret.slice(0,20))throw new Error('Credential one-time creation shape failed');
  const credentialPage=await reportRequest('/tokens');
  if(!credentialPage.data.some(row=>row.id===ownerCredential.id)||JSON.stringify(credentialPage).includes(ownerCredential.secret)||credentialPage.data.some(row=>row.token_hash))throw new Error('Credential listing privacy failed');
  await reportRequest('/links','GET',undefined,ownerCredential.secret);
  await reportRequest('/tokens','GET',undefined,ownerCredential.secret,403);
  await reportRequest('/tokens','POST',{name:'Spoof',created_by:reportOtherActor},undefined,400);
  // The identity boundary deliberately still reports admin: SQL must deny a stale claim.
  await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportActor]);
  await reportRequest('/members','GET',undefined,undefined,403);
  await reportRequest('/invitations','GET',undefined,undefined,403);
  await reportRequest('/apps','GET',undefined,undefined,403);
  const revokedNativeApp=await reportRequest('/public-app-association?hostname=queer.guide&platform=ios');
  if(revokedNativeApp.applinks.details.length||revokedNativeApp.appclips)throw new Error('Lost owner app association stayed public');
  if((await db.query("SELECT public.redirect_native_install_choices('queer.guide','/go/http-test') AS value")).rows[0].value.length)throw new Error('Lost owner install choice stayed public');
  await reportRequest('/tokens','GET',undefined,undefined,403);
  await reportRequest('/links','GET',undefined,ownerCredential.secret,403);
  await reportRequest('/tokens/'+ownerCredential.id,'DELETE',undefined,undefined,403);
  await reportRequest('/tokens','POST',{name:'Denied',expiresAt:new Date(Date.now()+86400000).toISOString(),scopes:['links:read']},undefined,403);

  await reportRequest('/links','GET',undefined,undefined,403);
  const spoofedSession=await fetch(base+'/links',{headers:{Authorization:'Bearer fixture-account-session','x-qg-redirect-session-actor':reportOtherActor}});
  if(spoofedSession.status!==403)throw new Error('Inbound actor header bypassed current owner checks');

  await reportRequest('/members/'+managedMember.id,'DELETE',undefined,undefined,403);
  if(!(await db.query('SELECT id FROM public.redirect_workspace_members WHERE id=$1',[managedMember.id])).rows.length)throw new Error('Stale admin removed member');
  await db.query("INSERT INTO public.user_roles VALUES($1,'admin')",[reportActor]);
  await reportRequest('/apps/'+activeNativeApp.id,'DELETE',{version:activeNativeApp.version});
  await reportRequest('/apps/'+androidNativeApp.id,'DELETE',{version:androidNativeApp.version});
  const credentialRevoked=await reportRequest('/tokens/'+ownerCredential.id,'DELETE');
  if(!credentialRevoked.revoked)throw new Error('Credential revoke HTTP failed');
  await reportRequest('/links','GET',undefined,ownerCredential.secret,403);
  console.log('Credential administration: actual HTTP -> current actor SQL, one-time secret, private metadata, own key scope, stale claims and idempotent revoke passed.');
  const memberRemoved=await reportRequest('/members/'+managedMember.id,'DELETE');
  if(!memberRemoved.deleted)throw new Error('Membership delete failed');
  console.log('Member administration: actual HTTP -> migrated SQL current actor checks, native field shapes, key denial and stale admin-claim read/delete rejection passed.');
  const domain=await reportRequest('/domains','POST',{hostname:'LINKS.Example.com.'},undefined,201);
  if(domain.hostname!=='links.example.com'||domain.ownershipVerified||domain.providerConnected)throw new Error('Domain creation claimed readiness');
  await reportRequest('/domains','GET',undefined,token,403);
  await reportRequest('/domains','POST',{hostname:'https://example.com'},undefined,400);
  const verifiedDomain=await reportRequest('/domains/'+domain.id+'/verify','POST',{version:domain.version});
  if(!verifiedDomain.ownershipVerified||verifiedDomain.providerConnected||dnsCalls!==1)throw new Error('Real domain API verification failed or claimed TLS');
  await reportRequest('/domains/'+domain.id+'/verify','POST',{version:verifiedDomain.version},undefined,429);
  if(dnsCalls!==1)throw new Error('DNS provider called before cooldown enforcement');
  await reportRequest('/domains/'+domain.id,'PATCH',{version:domain.version,rootUrl:'https://example.org/'},undefined,409);
  let defaults=await reportRequest('/domains/'+domain.id,'PATCH',{version:verifiedDomain.version,rootUrl:'https://example.org/home'});
  const connected=await reportRequest('/domains/'+domain.id+'/provider/connect','POST',{version:defaults.version});
  if(providerCreates!==0||connected.provider.state!=='queued')throw new Error('Provider request performed inline external writes');
  await policyRuntime.dispatchRedirectDomainJobs(service,providerConfig,fixtureDnsFetch);
  let providerView=await reportRequest('/domains/'+domain.id);
  if(providerCreates!==1||providerView.provider.hostnameStatus!=='active'||providerView.provider.certificateReady||providerView.provider.certificateStatus!=='pending_validation')throw new Error('Hostname and TLS states were conflated');
  await reportRequest('/domains/'+domain.id+'/provider/restart-validation','POST',{version:providerView.version},token,403);
  providerView=await reportRequest('/domains/'+domain.id+'/provider/restart-validation','POST',{version:providerView.version});
  if(!providerView.provider.validationRestartPending||providerRestarts)throw new Error('Validation restart was not durably queued');
  await policyRuntime.dispatchRedirectDomainJobs(service,providerConfig,fixtureDnsFetch);
  providerView=await reportRequest('/domains/'+domain.id);
  if(providerRestarts!==1||providerView.provider.validationRestartPending||!providerView.provider.validationRestartStartedAt||providerCreates!==1)throw new Error('Restart did not PATCH exact existing provider once');
  await reportRequest('/domains/'+domain.id+'/provider/restart-validation','POST',{version:providerView.version},undefined,400);
  await reportRequest('/domains/'+domain.id+'/provider/refresh','POST',{version:providerView.version});
  await policyRuntime.dispatchRedirectDomainJobs(service,providerConfig,fixtureDnsFetch);
  providerView=await reportRequest('/domains/'+domain.id);
  if(providerRestarts!==1)throw new Error('Status refresh repeated validation PATCH');
  for(const item of providerObjects.values())item.ssl.status='active';
  await reportRequest('/domains/'+domain.id+'/provider/refresh','POST',{version:providerView.version});
  await policyRuntime.dispatchRedirectDomainJobs(service,providerConfig,fixtureDnsFetch);
  providerView=await reportRequest('/domains/'+domain.id);
  if(!providerView.provider.certificateReady||providerCreates!==1)throw new Error('TLS polling recreated the hostname or lost readiness');
  await reportRequest('/links','POST',{slug:'same-domain-slug',target:'https://example.org/branded',domainId:domain.id},undefined,400);
  await db.query('SELECT public.record_redirect_domain_route($1)',[domain.hostname]);
  let primary=await reportRequest('/domain-preference');
  await reportRequest('/domain-preference','GET',undefined,token,403);
  await reportRequest('/domain-preference','PATCH',{domainId:domain.id,version:'invalid'},undefined,400);
  const originalPrimaryVersion=primary.version;
  primary=await reportRequest('/domain-preference','PATCH',{domainId:domain.id,version:primary.version});
  await reportRequest('/domain-preference','PATCH',{domainId:null,version:originalPrimaryVersion},undefined,409);
  const readyChoices=await reportRequest('/domain-choices?limit=1','GET',undefined,token);
  if(readyChoices.count!==1||readyChoices.primaryDomainId!==domain.id||readyChoices.primaryUnavailable||Object.keys(readyChoices.data[0]).sort().join(',')!=='hostname,id')throw new Error('Public domain choices leaked setup data or lost primary');

  const branded=(await reportRequest('/links','POST',{slug:'same-domain-slug',target:'https://example.org/branded',domainId:domain.id},undefined,201)).link;
  const builtinDomainLink=(await reportRequest('/links','POST',{slug:'same-domain-slug',target:'https://example.org/builtin'},undefined,201)).link;
  if(branded.shortUrl!=='https://links.example.com/same-domain-slug'||branded.id===builtinDomainLink.id)throw new Error('HTTP hostname namespace isolation failed');
  const archiveBefore=await reportRequest('/domains/'+domain.id);
  const archiveCounters={providerCreates,providerDeletes,providerRestarts,dnsCalls};
  const archiveEvents=(await db.query('SELECT count(*)::integer AS n FROM public.redirect_events')).rows[0].n;
  const archived=await reportRequest('/domains/'+domain.id,'PATCH',{version:archiveBefore.version,archived:true});
  if(!archived.archived||archived.disabled||!archived.routingReady)throw new Error('Archive disabled serving or lost versioned state');
  const activeArchiveSearch=await reportRequest('/domains?archive=active&q='+encodeURIComponent(domain.hostname));
  const archivedSearch=await reportRequest('/domains?archive=archived&limit=1&q='+encodeURIComponent(domain.hostname.toUpperCase()));
  if(activeArchiveSearch.count!==0||archivedSearch.count!==1||archivedSearch.data[0].id!==domain.id||archivedSearch.nextCursor!==null)throw new Error('Owner archive/search pages diverged');
  if((await reportRequest('/domain-choices','GET',undefined,token)).data.some(row=>row.id===domain.id))throw new Error('Archived domain stayed in new-link choices');
  if((await reportRequest('/links/'+branded.id)).shortUrl!==branded.shortUrl)throw new Error('Archive changed a managed URL');
  const archivePreference=await reportRequest('/domain-preference');if(archivePreference.domainId!==null||archivePreference.version===primary.version)throw new Error('Archive retained the primary default');
  await reportRequest('/domains/'+domain.id,'PATCH',{version:archiveBefore.version,archived:false},undefined,409);
  await reportRequest('/domain-preference','PATCH',{version:archivePreference.version,domainId:domain.id},undefined,400);
  for(const query of ['archive=invalid','archive=active&archive=all','q=one&q=two'])await reportRequest('/domains?'+query,'GET',undefined,undefined,400);
  await reportRequest('/domains?archive=archived','GET',undefined,token,403);
  await reportRequest('/domains/'+domain.id+'?archive=all','GET',undefined,undefined,400);
  await reportRequest('/domains/'+domain.id,'PATCH',{version:archived.version,archived:'false'},undefined,400);
  providerView=await reportRequest('/domains/'+domain.id,'PATCH',{version:archived.version,archived:false});
  if(providerView.archived||(await reportRequest('/domain-preference')).domainId!==null)throw new Error('Restore failed or silently set primary');
  if(JSON.stringify(archiveCounters)!==JSON.stringify({providerCreates,providerDeletes,providerRestarts,dnsCalls})||(await db.query('SELECT count(*)::integer AS n FROM public.redirect_events')).rows[0].n!==archiveEvents)throw new Error('Archive maintenance called a provider or recorded visits');
  primary=await reportRequest('/domain-preference','PATCH',{version:archivePreference.version,domainId:domain.id});
  console.log('Domain archives: owner HTTP -> migrated SQL active/archived/search paging, guarded archive/restore, current link URL, hidden new-link choice, atomic primary clearing and explicit re-selection pass without provider/visit effects.');

  await reportRequest('/qr-styles/workspace','POST',{},undefined,405);
  let qrWorkspace=await reportRequest('/qr-styles/workspace');
  qrWorkspace=await reportRequest('/qr-styles/workspace','PATCH',{version:qrWorkspace.version,style:{dots:'joined'}});
  await reportRequest('/qr-styles/workspace','PATCH',{version:null,style:{dots:'circle'}},undefined,409);
  await reportRequest('/qr-styles/workspace','GET',undefined,token,403);
  let qrDomain=await reportRequest('/qr-styles/domains/'+domain.id);
  if(qrDomain.effectiveStyle.dots!=='joined')throw new Error('Domain QR did not inherit workspace');
  qrDomain=await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:qrDomain.version,style:{border:'rounded'}});
  const qrEffective=await reportRequest('/qr-styles/links/'+branded.id,'GET',undefined,token);
  if(qrEffective.source!=='domain'||qrEffective.style.dots!=='joined'||qrEffective.style.border!=='rounded'||Object.keys(qrEffective).sort().join(',')!=='effectiveLogo,id,logoSource,source,style')throw new Error('Scoped QR style precedence or public fields incorrect');
  const qrBatch=await reportRequest('/qr-styles/links?ids='+branded.id,'GET',undefined,token);
  if(qrBatch.data[0].id!==branded.id)throw new Error('Batched QR style lookup failed');
  await reportRequest('/qr-styles/links?ids='+branded.id+','+branded.id,'GET',undefined,token,400);
  await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:qrDomain.version,style:null},token,403);
  await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:qrDomain.version,style:null});
  await reportRequest('/qr-styles/workspace','PATCH',{version:qrWorkspace.version,style:null});

  const logoPng=await sharp({create:{width:64,height:64,channels:3,background:'#221144'}}).png().toBuffer();
  const logoJpg=await sharp({create:{width:64,height:64,channels:3,background:'#442211'}}).jpeg().toBuffer();
  let ownerQr=await reportRequest('/qr-styles/workspace');
  await reportRequest('/qr-styles/workspace/logo','POST',{version:ownerQr.version,image:logoPng.toString('base64')},token,403);
  const beforeLogoUpload=logoUploads;
  await reportRequest('/qr-styles/workspace/logo','POST',{version:ownerQr.version,image:Buffer.from('<svg/>').toString('base64')},undefined,400);
  if(logoUploads!==beforeLogoUpload)throw new Error('Invalid raster reached Storage');
  ownerQr=await reportRequest('/qr-styles/workspace/logo','POST',{version:ownerQr.version,image:logoPng.toString('base64')});
  const workspaceLogo=ownerQr.logoAsset;
  if(workspaceLogo.url!=='https://fixture.supabase.co/storage/v1/object/public/redirect-brand-assets/'+workspaceLogo.key)throw new Error('Hosted logo URL escaped the fixed project bucket');
  if(ownerQr.logoMode!=='custom'||ownerQr.logoSource!=='workspace'||workspaceLogo.width!==64||!logoObjects.has(workspaceLogo.key)||Object.keys(workspaceLogo).sort().join(',')!=='bytes,height,id,key,mime,sha256,url,width')throw new Error('Logo upload did not attach minimal checked asset metadata');
  let logoDomain=await reportRequest('/qr-styles/domains/'+domain.id);
  if(logoDomain.effectiveLogo.id!==workspaceLogo.id)throw new Error('Logo did not inherit workspace');
  logoDomain=await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:logoDomain.version,logoMode:'none'});
  const hiddenLogo=await reportRequest('/qr-styles/links/'+branded.id,'GET',undefined,token);
  if(hiddenLogo.logoSource!=='hidden'||hiddenLogo.effectiveLogo!==null)throw new Error('Hidden logo leaked an effective asset');
  logoDomain=await reportRequest('/qr-styles/domains/'+domain.id+'/logo','POST',{version:logoDomain.version,image:logoJpg.toString('base64')});
  const domainLogo=logoDomain.logoAsset;
  const effectiveLogo=await reportRequest('/qr-styles/links/'+branded.id,'GET',undefined,token);
  if(effectiveLogo.logoSource!=='domain'||effectiveLogo.effectiveLogo.id!==domainLogo.id||domainLogo.mime!=='image/jpeg')throw new Error('Domain JPEG logo did not take precedence');
  // Actual owner/key HTTP -> migrated SQL -> bounded Worker profile loading -> real Wasm QR rendering.
  const {register:registerQrRuntime}=await import('tsx/esm/api');
  const qrRuntime=registerQrRuntime({namespace:'qr-image-http-fixture'});
  try {
    const [{qrImageResponse},{readQrImageProfile},{initWasm},{default:decodeImageQr}]=await Promise.all([
      qrRuntime.import('../workers/redirect-qr/handler.ts',import.meta.url),
      qrRuntime.import('../workers/redirect-qr/profile.ts',import.meta.url),
      qrRuntime.import('@resvg/resvg-wasm',import.meta.url),
      import('jsqr'),
    ]);
    await initWasm(readFileSync('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
    const imageFetch=async(input,options)=>{
      const url=new URL(String(input));
      if(url.href==='https://fixture.supabase.co/functions/v1/redirect-api/public-qr-image')return fetch(base+'/public-qr-image',options);
      const prefix='https://fixture.supabase.co/storage/v1/object/public/redirect-brand-assets/';
      if(url.href.startsWith(prefix)){
        if(options?.credentials!=='omit'||options?.redirect!=='manual'||new Headers(options?.headers).has('Authorization'))throw new Error('Image logo read forwarded credentials or followed redirects');
        const object=logoObjects.get(url.href.slice(prefix.length));return object?new Response(object.bytes,{headers:{'Content-Type':object.mime}}):new Response(null,{status:404});
      }
      throw new Error('Unexpected QR external request');
    };
    const renderedImage=async(imageUrl,format='png')=>{
      const url=new URL(imageUrl);url.searchParams.set('format',format);url.searchParams.set('size','512');
      return qrImageResponse(new Request(url),'https://fixture.supabase.co',async()=>true,async()=>{},imageFetch,
        (bearer,signal)=>readQrImageProfile(bearer,'https://fixture.supabase.co','fixture-anon',signal,imageFetch));
    };
    const capability=(record)=>new URL(record.imageUrls.png).searchParams.get('share');
    const imageCounters=(await db.query('SELECT (SELECT count(*) FROM public.redirect_events)::integer AS events,(SELECT click_count FROM public.redirects WHERE id=$1) AS clicks',[branded.id])).rows[0];
    const liveImage=await reportRequest('/qr-images','POST',{linkId:branded.id,label:'Live branded image'},undefined,201);
    if(!/^qg_qr_[a-f0-9]{64}$/.test(capability(liveImage))||liveImage.token_hash||liveImage.principal_key||liveImage.expiresAt!==null)throw new Error('Image creation leaked private fields or changed default lifetime');
    let publicImage=await reportRequest('/public-qr-image','GET',undefined,capability(liveImage));
    if(publicImage.effectiveLogo.id!==domainLogo.id||publicImage.url!==branded.shortUrl||Object.keys(publicImage).sort().join(',')!=='effectiveLogo,logoSource,style,tracked,url'||JSON.stringify(publicImage).includes('example.org/branded'))throw new Error('Public image profile leaked destination or lost logo/canonical URL');
    const svgImage=await renderedImage(liveImage.imageUrls.svg,'svg');
    if(svgImage.status!==200||!(await svgImage.text()).includes('data:image/jpeg;base64,'+logoJpg.toString('base64')))throw new Error('Live image failed to render current domain JPEG');
    logoDomain=await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:logoDomain.version,style:{dots:'joined'},logoMode:'inherit'});
    publicImage=await reportRequest('/public-qr-image','GET',undefined,capability(liveImage));
    if(publicImage.effectiveLogo.id!==workspaceLogo.id||publicImage.style.dots!=='joined')throw new Error('Live image failed to follow inherited PNG/appearance changes');
    for(const format of ['png','jpg']){
      const response=await renderedImage(liveImage.imageUrls[format],format);if(response.status!==200)throw new Error('Live image rendering failed: '+await response.text());
      const {data,info}=await sharp(new Uint8Array(await response.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if(decodeImageQr(new Uint8ClampedArray(data),info.width,info.height)?.data!==branded.shortUrl+'?qg_qr=1')throw new Error('Live hosted image encoded the wrong redirect');
    }
    logoDomain=await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:logoDomain.version,logoMode:'custom'});
    const preferencesBeforeCustom=await reportRequest('/qr-styles/workspace');
    const installImage=await reportRequest('/qr-images','POST',{linkId:branded.id,purpose:'install',entryQuery:'utm_source=poster%20one&ref=community%2Bfriends',logo:logoPng.toString('base64')},undefined,201);
    if(installImage.purpose!=='install'||installImage.state!=='published')throw new Error('Install image lost purpose/artwork publication');
    const installProfile=await reportRequest('/public-qr-image','GET',undefined,capability(installImage));
    const installTarget=branded.shortUrl+'?qg_handoff=install&utm_source=poster+one&ref=community%2Bfriends';
    if(installProfile.url!==installTarget||installProfile.effectiveLogo.id!==installImage.logoAsset.id)throw new Error('Install profile lost exact campaign URL or custom artwork');
    for(const format of ['png','jpg','svg']){
      const response=await renderedImage(installImage.imageUrls[format],format);if(response.status!==200)throw new Error('Install QR rendering failed: '+await response.text());
      const {data,info}=await sharp(new Uint8Array(await response.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if(decodeImageQr(new Uint8ClampedArray(data),info.width,info.height)?.data!==installTarget+'&qg_qr=1')throw new Error('Install hosted image encoded a different URL');
    }
    await reportRequest('/qr-images','POST',{linkId:branded.id,purpose:'install',entryQuery:'%70assword=private'},undefined,400);
    await reportRequest('/qr-images','POST',{url:'https://example.org/',purpose:'install'},undefined,400);
    await reportRequest('/qr-images/'+installImage.id,'DELETE',{version:installImage.version});
    await db.query("UPDATE public.redirect_qr_assets SET next_cleanup_at=now()-interval '1 second' WHERE id=$1",[installImage.logoAsset.id]);
    await policyRuntime.dispatchRedirectQrAssetCleanup(service,policyRuntime.qrAssetStorageConfig('https://fixture.supabase.co','fixture-service'),fixtureDnsFetch);
    if(logoObjects.has(installImage.logoAsset.key))throw new Error('Revoked install image artwork was not cleaned');
    await reportRequest('/public-qr-image','GET',undefined,capability(installImage),404);
    const customImage=await reportRequest('/qr-images','POST',{linkId:branded.id,logo:logoPng.toString('base64')},undefined,201);
    if(customImage.state!=='published'||customImage.logoMode!=='custom'||!customImage.logoAsset?.url)throw new Error('Custom image did not publish checked artwork');
    const customProfile=await reportRequest('/public-qr-image','GET',undefined,capability(customImage));
    if(customProfile.logoSource!=='custom'||customProfile.effectiveLogo.id!==customImage.logoAsset.id||JSON.stringify(await reportRequest('/qr-styles/workspace'))!==JSON.stringify(preferencesBeforeCustom))throw new Error('Image artwork changed workspace defaults or lost custom precedence');
    const customSvg=await renderedImage(customImage.imageUrls.svg,'svg');if(customSvg.status!==200||!(await customSvg.text()).includes('data:image/png;base64,'+logoPng.toString('base64')))throw new Error('Hosted custom image lost its artwork');
    await db.query("UPDATE public.redirect_qr_assets SET next_cleanup_at=now()-interval '1 second' WHERE id=$1",[customImage.logoAsset.id]);
    await policyRuntime.dispatchRedirectQrAssetCleanup(service,policyRuntime.qrAssetStorageConfig('https://fixture.supabase.co','fixture-service'),fixtureDnsFetch);
    if(!logoObjects.has(customImage.logoAsset.key))throw new Error('Cleanup deleted referenced image artwork');
    await reportRequest('/qr-images/'+customImage.id,'DELETE',{version:customImage.version});
    await db.query("UPDATE public.redirect_qr_assets SET next_cleanup_at=now()-interval '1 second' WHERE id=$1",[customImage.logoAsset.id]);
    await policyRuntime.dispatchRedirectQrAssetCleanup(service,policyRuntime.qrAssetStorageConfig('https://fixture.supabase.co','fixture-service'),fixtureDnsFetch);
    if(logoObjects.has(customImage.logoAsset.key))throw new Error('Revoked image artwork was not physically cleaned');
    const customUploadsBefore=logoUploads;
    const invalidLogo=logoPng.subarray(0,34).toString('base64');
    await reportRequest('/qr-images','POST',{linkId:branded.id,logo:invalidLogo},undefined,400);
    failArtworkVerification=true;
    await reportRequest('/qr-images','POST',{linkId:branded.id,logo:logoPng.toString('base64')},undefined,503);
    failArtworkVerification=false;
    if(logoUploads!==customUploadsBefore)throw new Error('Unverified artwork reached Storage');
    loseLogoReceipt=true;
    await reportRequest('/qr-images','POST',{linkId:branded.id,logo:logoPng.toString('base64')},undefined,503);
    if(logoUploads!==customUploadsBefore+1)throw new Error('Unknown image upload was retried');
    revokeLogoOwner=true;
    await reportRequest('/qr-images','POST',{linkId:branded.id,logo:logoPng.toString('base64')},undefined,403);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[reportActor]);
    const pendingArt=(await db.query("SELECT token_hash FROM public.redirect_qr_image_links WHERE publication_state='pending'")).rows;
    for(const pending of pendingArt)if((await db.query('SELECT public.redirect_public_qr_image($1) AS profile',[pending.token_hash])).rows[0].profile!==null)throw new Error('Failed artwork draft became public');
    if(JSON.stringify(await reportRequest('/qr-styles/workspace'))!==JSON.stringify(preferencesBeforeCustom))throw new Error('Failed custom artwork altered defaults');
    const keyImage=await reportRequest('/qr-images','POST',{linkId:branded.id,logoMode:'none',style:{dots:'circle'}},token,201);
    const keyList=await reportRequest('/qr-images?limit=100','GET',undefined,token);
    if(keyList.data.some(row=>row.id===liveImage.id)||!keyList.data.some(row=>row.id===keyImage.id)||JSON.stringify(keyList).includes(capability(keyImage)))throw new Error('Image list escaped creator scope or exposed capability');
    await reportRequest('/qr-images','POST',{url:'https://example.org/'},token,403);
    await reportRequest('/qr-images','POST',{linkId:branded.id,style:{unknown:null}},undefined,400);
    await reportRequest('/qr-images/'+liveImage.id,'DELETE',{version:liveImage.version},token,404);
    await db.query('UPDATE public.redirect_api_tokens SET revoked_at=now() WHERE token_hash=$1',[digest]);
    await reportRequest('/public-qr-image','GET',undefined,capability(keyImage),404);
    await db.query('UPDATE public.redirect_api_tokens SET revoked_at=NULL WHERE token_hash=$1',[digest]);
    await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportActor]);
    await reportRequest('/public-qr-image','GET',undefined,capability(liveImage),404);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[reportActor]);
    await reportRequest('/qr-images/'+liveImage.id,'DELETE',{version:webcrypto.randomUUID()},undefined,409);
    await reportRequest('/qr-images/'+liveImage.id,'DELETE',{version:liveImage.version});
    await reportRequest('/public-qr-image','GET',undefined,capability(liveImage),404);
    if((await renderedImage(liveImage.imageUrls.png)).status!==404)throw new Error('Revoked image silently rendered fallback branding');
    await reportRequest('/public-qr-image','GET',undefined,token,404);
    await reportRequest('/qr-images','GET',undefined,capability(keyImage),401);
    await reportRequest('/public-qr-image?url=https://evil.example','GET',undefined,capability(keyImage),400);
    const imageCountersAfter=(await db.query('SELECT (SELECT count(*) FROM public.redirect_events)::integer AS events,(SELECT click_count FROM public.redirects WHERE id=$1) AS clicks',[branded.id])).rows[0];
    if(JSON.stringify(imageCounters)!==JSON.stringify(imageCountersAfter))throw new Error('Hosted image requests recorded visits or consumed quota');
    await db.query("INSERT INTO public.redirect_qr_image_links(token_hash,creator_user_id,principal_key,encoded_url,label,created_at) SELECT md5('image-quota'||i)||md5('image-quota-hash'||i),$1::uuid,'owner:'||($1::uuid)::text,'https://example.com/','Image quota fixture',now()-interval '2 hours' FROM generate_series(1,100) i",[reportActor]);
    const imageLimited=await fetch(base+'/qr-images',{method:'POST',headers:{Authorization:'Bearer fixture-account-session','Content-Type':'application/json'},body:JSON.stringify({linkId:branded.id})});
    if(imageLimited.status!==429||imageLimited.headers.get('Retry-After')!=='3600')throw new Error('Image creation quota did not preserve HTTP Retry-After');
    await db.query("DELETE FROM public.redirect_qr_image_links WHERE label='Image quota fixture'");
    console.log('Live QR image links: authenticated HTTP -> migrated SQL -> bounded public profile/asset reads -> real Wasm SVG/PNG/JPG, dynamic branding, exact tracked URL decoding, scoped list/revoke and current owner/key revocation passed without visits.');
  } finally { await qrRuntime.unregister(); }
  logoDomain=await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:logoDomain.version,logoMode:'inherit'});
  if(logoDomain.logoAsset.id!==domainLogo.id||logoDomain.effectiveLogo.id!==workspaceLogo.id)throw new Error('Inherit discarded retained upload');
  logoDomain=await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:logoDomain.version,logoMode:'custom'});
  logoDomain=await reportRequest('/qr-styles/domains/'+domain.id,'PATCH',{version:logoDomain.version,clearLogo:true});
  await db.query("UPDATE public.redirect_qr_assets SET next_cleanup_at=now()-interval '1 second' WHERE id=$1",[domainLogo.id]);
  const storageConfig=policyRuntime.qrAssetStorageConfig('https://fixture.supabase.co','fixture-service');
  await policyRuntime.dispatchRedirectQrAssetCleanup(service,storageConfig,fixtureDnsFetch);
  if(logoObjects.has(domainLogo.key)||!logoObjects.has(workspaceLogo.key))throw new Error('Cleanup missed retired logo or deleted referenced workspace asset');
  // A late physical upload to an already-deleted key is still tracked by its tombstone.
  logoObjects.set(domainLogo.key,{bytes:logoJpg,mime:'image/jpeg'});
  await db.query("UPDATE public.redirect_qr_assets SET next_cleanup_at=now()-interval '1 second' WHERE id=$1",[domainLogo.id]);
  await policyRuntime.dispatchRedirectQrAssetCleanup(service,storageConfig,fixtureDnsFetch);
  if(logoObjects.has(domainLogo.key))throw new Error('Tombstone did not clean late upload');
  const beforeAmbiguous=logoUploads;
  loseLogoReceipt=true;
  await reportRequest('/qr-styles/workspace/logo','POST',{version:ownerQr.version,image:logoPng.toString('base64')},undefined,503);
  if(logoUploads!==beforeAmbiguous+1)throw new Error('Uncertain logo upload was retried');
  revokeLogoOwner=true;
  await reportRequest('/qr-styles/workspace/logo','POST',{version:ownerQr.version,image:logoPng.toString('base64')},undefined,403);
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[reportActor]);
  const unchangedLogo=await reportRequest('/qr-styles/workspace');
  if(unchangedLogo.logoAsset.id!==workspaceLogo.id||unchangedLogo.version!==ownerQr.version)throw new Error('Failed/unauthorized upload changed preference');
  await db.query("UPDATE public.redirect_qr_assets SET expires_at=now()-interval '1 second',next_cleanup_at=now()-interval '1 second' WHERE state='pending'");
  await policyRuntime.dispatchRedirectQrAssetCleanup(service,storageConfig,fixtureDnsFetch);
  for(let expiredPass=0;expiredPass<10&&logoObjects.size>1;expiredPass++)await policyRuntime.dispatchRedirectQrAssetCleanup(service,storageConfig,fixtureDnsFetch);
  if(logoObjects.size!==1||!logoObjects.has(workspaceLogo.key))throw new Error('Orphan cleanup did not leave exactly the referenced asset');
  const staleUploadCount=logoUploads;
  await reportRequest('/qr-styles/workspace/logo','POST',{version:null,image:logoPng.toString('base64')},undefined,409);
  if(logoUploads!==staleUploadCount)throw new Error('Stale version uploaded bytes');
  ownerQr=await reportRequest('/qr-styles/workspace','PATCH',{version:ownerQr.version,clearLogo:true});
  const beforePendingLimit=logoUploads;
  for(let attempt=0;attempt<3;attempt++){loseLogoReceipt=true;await reportRequest('/qr-styles/workspace/logo','POST',{version:ownerQr.version,image:logoPng.toString('base64')},undefined,503);}
  const logoLimited=await fetch(base+'/qr-styles/workspace/logo',{method:'POST',headers:{Authorization:'Bearer fixture-account-session','Content-Type':'application/json'},body:JSON.stringify({version:ownerQr.version,image:logoPng.toString('base64')})});
  if(logoLimited.status!==429||logoLimited.headers.get('Retry-After')!=='900'||logoUploads!==beforePendingLimit+3)throw new Error('Logo upload budget reached Storage or lost retry header');
  await logoLimited.json();
  await db.query("UPDATE public.redirect_qr_assets SET expires_at=now()-interval '1 second',next_cleanup_at=now()-interval '1 second' WHERE state='pending'");
  await policyRuntime.dispatchRedirectQrAssetCleanup(service,storageConfig,fixtureDnsFetch);
  await db.query("UPDATE public.redirect_qr_assets SET next_cleanup_at=now()-interval '1 second' WHERE id=$1",[workspaceLogo.id]);
  await policyRuntime.dispatchRedirectQrAssetCleanup(service,storageConfig,fixtureDnsFetch);
  if(logoObjects.size)throw new Error('Cleared logo fixtures left physical objects');
  console.log('Hosted QR logos: actual owner HTTP → reservation/migrated SQL → bounded Storage transport proves PNG/JPG validation, version/current-owner recheck, domain/workspace/hide precedence, retained/reset logos, no blind upload retry, orphan cleanup and late-upload tombstones.');
  console.log('Saved QR appearance: actual owner HTTP/migrated SQL verifies version conflicts, workspace/domain inheritance, minimal scoped single/batch reads, key write denial and reset.');
  const domainPage=await reportRequest('/links?filters='+encodeURIComponent(JSON.stringify({domainId:domain.id})));
  if(domainPage.count!==1||domainPage.data[0].id!==branded.id)throw new Error('HTTP domain filter mixed namespaces');
  const updatedBranded=(await reportRequest('/links/upsert','PUT',{slug:'same-domain-slug',target:'https://example.org/updated',domainId:domain.id})).link;
  if(updatedBranded.id!==branded.id||(await reportRequest('/links/'+builtinDomainLink.id)).target!=='https://example.org/builtin')throw new Error('HTTP upsert crossed domain namespace');
  await db.query("UPDATE public.redirect_domains SET verified_until=now()+interval '5 hours',next_check_at=now()-interval '1 second' WHERE id=$1",[domain.id]);
  await reportRequest('/domains/'+domain.id+'/provider/refresh','POST',{version:providerView.version});
  await policyRuntime.dispatchRedirectDomainJobs(service,providerConfig,fixtureDnsFetch);
  providerView=await reportRequest('/domains/'+domain.id);
  if(!providerView.routingReady||dnsCalls!==2||Date.parse(providerView.verifiedUntil)-Date.now()<23*3600000)throw new Error('Background ownership renewal or current routing proof failed');
  await reportRequest('/links/'+branded.id,'DELETE');await reportRequest('/links/'+builtinDomainLink.id,'DELETE');
  console.log('Hostname-scoped HTTP links: route-proof gating, canonical URLs, same-slug isolation, domain filters, scoped upsert and background DNS renewal passed.');
  let manual=await reportRequest('/manual-records','POST',{values:{type:'PATH',source_path:'/manual-http',match_kind:'WILDCARD',target:'/events',notes:'HTTP notes',start_at:'2020-01-01T00:00:00Z',end_at:'2030-01-01T00:00:00Z',click_limit:11,query_mode:'OVERRIDE',query_override:{audience:'friends'},utm_defaults:{utm_source:'print'}}},undefined,201);
  await reportRequest('/manual-records/'+manual.id,'GET',undefined,token,403);
  await reportRequest('/manual-records/'+manual.id,'PATCH',{values:{click_count:0},expectedUpdatedAt:manual.updated_at},undefined,400);
  const oldManualTime=manual.updated_at;
  manual=await reportRequest('/manual-records/'+manual.id,'PATCH',{values:{type:'SHORT',slug:'manual-http',domain_id:domain.id},expectedUpdatedAt:manual.updated_at});
  if(manual.type!=='SHORT'||manual.domain_hostname!==domain.hostname||manual.notes!=='HTTP notes'||manual.click_limit!==11||manual.source_path!==null)throw new Error('Atomic manual HTTP conversion lost fields');
  await reportRequest('/manual-records/'+manual.id,'PATCH',{values:{target:'/stale'},expectedUpdatedAt:oldManualTime},undefined,409);
  await reportRequest('/links/'+manual.id+'/policy','PATCH',{policy:{track_conversions:true}});
  manual=await reportRequest('/manual-records/'+manual.id);
  manual=await reportRequest('/manual-records/'+manual.id,'PATCH',{values:{end_at:null},expectedUpdatedAt:manual.updated_at});
  const manualPolicy=await reportRequest('/links/'+manual.id+'/policy');if(manualPolicy.policy.expires_at||!manualPolicy.policy.track_conversions)throw new Error('Manual expiry failed to preserve other policy fields');
  const disconnect=await reportRequest('/domains/'+domain.id+'/provider/disconnect','POST',{version:providerView.version});
  if(disconnect.provider.certificateReady||providerObjects.size!==1)throw new Error('Disconnect did not close readiness before cleanup');
  const usedDomains=await reportRequest('/linked-domains?limit=1','GET',undefined,token);
  if(usedDomains.count!==1||usedDomains.data[0].id!==domain.id||usedDomains.data[0].hostname!==domain.hostname||usedDomains.data[0].linkCount!==1||!/^[a-f0-9]{32}$/.test(usedDomains.revision)||Object.keys(usedDomains.data[0]).sort().join(',')!=='hostname,id,linkCount')throw new Error('Management facet lost inactive domain or exposed private fields');
  const domainLinks=await reportRequest('/links?filters='+encodeURIComponent(JSON.stringify({domainId:domain.id})),'GET',undefined,token);
  if(domainLinks.count!==1||domainLinks.data[0].id!==manual.id)throw new Error('Inactive domain filter failed');
  const builtinLinks=await reportRequest('/links?filters='+encodeURIComponent(JSON.stringify({domainId:null})),'GET',undefined,token);
  if(!builtinLinks.count||builtinLinks.data.some(link=>link.domainId!==null))throw new Error('Builtin filter mixed namespaces');

  manual=await reportRequest('/manual-records/'+manual.id,'PATCH',{values:{notes:'Repaired while unavailable'},expectedUpdatedAt:manual.updated_at});
  manual=await reportRequest('/manual-records/'+manual.id,'PATCH',{values:{type:'PATH',source_path:'/manual-return',domain_id:null},expectedUpdatedAt:manual.updated_at});
  if(manual.domain_id!==null||manual.domain_hostname!==null||manual.slug!==null||manual.notes!=='Repaired while unavailable')throw new Error('Manual repair/path conversion failed');
  const afterMoveFacets=await reportRequest('/linked-domains','GET',undefined,token);
  if(afterMoveFacets.count!==0||afterMoveFacets.revision===usedDomains.revision)throw new Error('Moved link left a stale management domain facet');
  console.log('Linked-domain facets: actual scoped HTTP proves inactive-domain visibility, minimal public fields, custom/builtin filtering and revision changes after a move.');

  console.log('Manual owner API: actual HTTP → migrated SQL proves full fields, atomic branded conversions, stale/readonly/key denial, policy-expiry sync and unavailable-domain repair.');
  const unavailablePrimary=await reportRequest('/domain-choices');
  if(!unavailablePrimary.primaryUnavailable||unavailablePrimary.primaryDomainId!==domain.id||unavailablePrimary.count!==0)throw new Error('Disconnected primary silently became builtin');

  await policyRuntime.dispatchRedirectDomainJobs(service,providerConfig,fixtureDnsFetch);
  defaults=await reportRequest('/domains/'+domain.id);
  if(defaults.providerConnected||providerObjects.size||providerDeletes!==1||defaults.provider.state!=='disconnected')throw new Error('Provider cleanup failed or orphaned an object');
  console.log('Hostname lifecycle: actual owner HTTP → migrated queue → actual provider adapter → isolated Cloudflare API; pending TLS vs active, one POST, owner-only queued validation restart, exact one PATCH, cooldown, GET-only refresh and asynchronous disconnect/delete passed.');
  await db.query("UPDATE public.redirect_domains SET next_check_at=now()-interval '1 second' WHERE id=$1",[domain.id]);
  dnsMissing=true;
  const lost=await reportRequest('/domains/'+domain.id+'/verify','POST',{version:defaults.version});
  if(lost.ownershipState!=='lost'||lost.ownershipVerified)throw new Error('Missing DNS proof preserved ownership');
  await reportRequest('/domains/'+domain.id,'DELETE',{version:lost.version});
  await reportRequest('/domains/'+domain.id,'GET',undefined,undefined,404);
  const clearedPrimary=await reportRequest('/domain-preference');
  if(clearedPrimary.domainId!==null||clearedPrimary.version===primary.version||!clearedPrimary.ready)throw new Error('Domain deletion did not version and clear primary reference');
  console.log('Domain choices/primary: real HTTP proves ready-only public fields, key read scope, owner-only preference, stale-write conflicts, disconnected default warning and FK/version cleanup.');

  console.log('Domain registry: real HTTP handler → migrated SQL → isolated DNS response, fresh ownership, cooldown before DNS, lost proof, versioned defaults/deletion and key rejection passed; no DNS/provider writes.');
  const identityCustomer=(await db.query("SELECT customer_key FROM public.redirect_link_customers WHERE customer_key LIKE 'sdk:%/customer & ü' ORDER BY customer_key LIMIT 1")).rows[0].customer_key;
  const identityPath='/customers/profile?id='+encodeURIComponent(identityCustomer);
  let identityProfile=await reportRequest(identityPath);
  identityProfile=await reportRequest('/customers/profile','PATCH',{customerExternalId:identityCustomer,version:identityProfile.version,name:'PRIVATE_IDENTITY_HTTP',email:'private-identity@example.com'});
  const privateIdentityVersion=identityProfile.version;
  await reportRequest('/customers/profile','PATCH',{customerExternalId:identityCustomer,version:null,name:'Stale HTTP'},undefined,409);
  await reportRequest('/customers/profile','PATCH',{customerExternalId:identityCustomer,version:privateIdentityVersion,avatarUrl:'https://127.0.0.1/logo.png'},undefined,400);
  const hiddenIdentityLink=(await db.query("INSERT INTO public.redirects(type,slug,target) VALUES('SHORT','identity-hidden-http','https://example.com/hidden') RETURNING id")).rows[0].id;
  const hiddenIdentityClick=(await db.query("SELECT public.record_redirect_visit($1,'/go/identity-hidden-http',NULL,NULL,'Fixture','CH',NULL,302,NULL,'https://example.com/hidden') AS id",[hiddenIdentityLink])).rows[0].id;
  const movedIdentitySale=(await db.query("UPDATE public.redirect_link_conversions SET click_id=$1 WHERE customer_key=$2 AND kind='sale' RETURNING id",[hiddenIdentityClick,identityCustomer])).rows[0].id;
  await db.query('UPDATE public.redirect_api_tokens SET redirect_ids=$1 WHERE token_hash=$2',[[seed.rows[0].id],digest]);
  if((await reportRequest(identityPath,'GET',undefined,token)).canEdit!==false)throw new Error('Partial customer HTTP key can edit identity');
  await reportRequest('/customers/profile','PATCH',{customerExternalId:identityCustomer,version:privateIdentityVersion,name:'Partial scope'},token,403);
  const scopedJourney=await reportRequest('/customers/journey?id='+encodeURIComponent(identityCustomer),'GET',undefined,token);
  if(JSON.stringify(scopedJourney).includes('/go/identity-hidden-http'))throw new Error('Customer journey HTTP leaked a hidden source');
  await db.query('UPDATE public.redirect_api_tokens SET redirect_ids=$1 WHERE token_hash=$2',[[hiddenIdentityLink],digest]);
  await reportRequest('/customers/profile?id='+encodeURIComponent('unknown customer'),'GET',undefined,token,404);
  await db.query('UPDATE public.redirect_api_tokens SET redirect_ids=NULL WHERE token_hash=$1',[digest]);
  await db.query('UPDATE public.redirect_link_conversions SET click_id=$1 WHERE id=$2',[click.rows[0].id,movedIdentitySale]);
  await db.query('DELETE FROM public.redirects WHERE id=$1',[hiddenIdentityLink]);
  const saved=await reportRequest('/reports','POST',{name:'Native HTTP report',filters:{linkIds:[seed.rows[0].id]}},undefined,201);
  const plain=await reportRequest('/reports/'+saved.id+'/shares','POST',{title:'Clicks only',reportVersion:saved.version,expiresAt:null},undefined,201);
  const published=await reportRequest('/public-report','GET',undefined,'qg_report_'+plain.id);
  if(JSON.stringify(published).includes('PRIVATE_IDENTITY_HTTP')||JSON.stringify(published).includes('private-identity@example.com'))throw new Error('Public report leaked customer identity');
  if(published.allowIndexing!==false||published.report.totals.clicks!==1||'leads' in published.report.totals||published.report.revenue.length||JSON.stringify(published).includes('sdk-attribution'))throw new Error('Public report exposed private/conversion fields');
  const indexedShare=await reportRequest('/reports/'+saved.id+'/shares','POST',{title:'Indexed HTTP publication',reportVersion:saved.version,allowIndexing:true,expiresAt:null},undefined,201);
  const indexedPublic=await reportRequest('/public-report','GET',undefined,'qg_report_'+indexedShare.id);
  if(indexedPublic.allowIndexing!==true)throw new Error('Explicit indexing choice not exposed by actual HTTP');
  await reportRequest('/reports/'+saved.id+'/shares','POST',{title:'Rejected combination',reportVersion:saved.version,allowIndexing:true,password:'fixture-report-password'},undefined,400);
  await reportRequest('/reports/'+saved.id+'/shares/'+indexedShare.id,'DELETE');
  await reportRequest('/public-report','GET',undefined,'qg_report_'+indexedShare.id,404);
  const zeroDates={start:'2000-01-01T00:00:00.000Z',end:'2000-01-02T00:00:00.000Z'};
  const narrowed=await reportRequest('/public-report','POST',{dates:zeroDates},'qg_report_'+plain.id);
  if(narrowed.report.totals.clicks!==0||narrowed.dateRange.start!==zeroDates.start)throw new Error('Public date selection ignored or failed normalization');
  await reportRequest('/public-report','POST',{dates:{linkIds:[seed.rows[0].id]}},'qg_report_'+plain.id,400);
  const guarded=await reportRequest('/reports/'+saved.id+'/shares','POST',{title:'Protected conversions',reportVersion:saved.version,includeConversions:true,password:'fixture-report-password',expiresAt:null},undefined,201);
  await reportRequest('/public-report','GET',undefined,'qg_report_'+guarded.id,401);
  await reportRequest('/public-report','POST',{password:'incorrect'},'qg_report_'+guarded.id,401);
  const unlocked=await reportRequest('/public-report','POST',{password:'fixture-report-password'},'qg_report_'+guarded.id);
  if(unlocked.report.totals.leads!==10||unlocked.report.totals.sales!==10||unlocked.report.revenue[0].amount!=='254.500010')throw new Error('Protected report conversion totals/precision changed');
  const protectedDates=await reportRequest('/public-report','POST',{password:'fixture-report-password',dates:zeroDates},'qg_report_'+guarded.id);
  if(protectedDates.report.totals.sales!==0)throw new Error('Password-protected date filtering failed');
  await reportRequest('/reports/'+saved.id+'/shares/'+guarded.id,'DELETE');
  await reportRequest('/public-report','POST',{password:'fixture-report-password'},'qg_report_'+guarded.id,404);
  const clearedIdentity=await reportRequest('/customers/profile','DELETE',{customerExternalId:identityCustomer,version:privateIdentityVersion});
  if(clearedIdentity.name!==null||clearedIdentity.email!==null||clearedIdentity.version===privateIdentityVersion)throw new Error('HTTP identity clear failed');
  console.log('Private customer profiles: five native SDK methods, opaque UTF-8 IDs, scoped chronological pages, partial-grant edit denial, stale writes, private public-report boundary and identity-only clear passed.');
  let teamReport=await reportRequest('/reports','POST',{name:'HTTP team report',filters:{}},undefined,201);
  await reportRequest('/reports/'+teamReport.id,'GET',undefined,'fixture-other-account-session',404);
  teamReport=await reportRequest('/reports/'+teamReport.id,'PATCH',{version:teamReport.version,visibility:'team'});
  const teamPage=await reportRequest('/reports?view=team','GET',undefined,'fixture-other-account-session');
  const teamItem=teamPage.data.find(item=>item.id===teamReport.id);
  if(!teamItem||teamItem.canEdit!==false||'owner_user_id' in teamItem)throw new Error('Team HTTP discovery/metadata failed');
  if((await reportRequest('/reports','GET',undefined,'fixture-other-account-session')).data.some(item=>item.id===teamReport.id))throw new Error('Team report changed default personal list');
  await reportRequest('/reports/'+teamReport.id,'PATCH',{version:teamReport.version,name:'Forbidden'},'fixture-other-account-session',404);
  await reportRequest('/reports/'+teamReport.id+'/shares','GET',undefined,'fixture-other-account-session',404);
  for(const suffix of ['?view=team&view=all','?view=public','?view=team&unknown=1'])await reportRequest('/reports'+suffix,'GET',undefined,undefined,400);
  await reportRequest('/reports?view=team','GET',undefined,token,403);
  await reportRequest('/reports/'+teamReport.id+'?view=team','GET',undefined,undefined,400);
  const copiedTeam=await reportRequest('/reports','POST',{name:'HTTP private copy',filters:teamItem.filters},'fixture-other-account-session',201);
  if(copiedTeam.visibility!=='private'||!copiedTeam.canEdit)throw new Error('Team HTTP copy not private');
  teamReport=await reportRequest('/reports/'+teamReport.id,'PATCH',{version:teamReport.version,visibility:'private'});
  await reportRequest('/reports/'+teamReport.id,'GET',undefined,'fixture-other-account-session',404);
  await reportRequest('/reports/'+teamReport.id,'DELETE');
  await reportRequest('/reports/'+copiedTeam.id,'DELETE',undefined,'fixture-other-account-session');
  console.log('Team reports: actual owner HTTP/migrated SQL proves explicit opt-in, default privacy, read-only discovery, guarded visibility, private copy, key denial and strict views.');
  console.log('Saved/share/public reports: real HTTP → edge handler → migrated PostgreSQL, real password verification, sanitized totals and revocation passed');
  const passwordBrandLink=(await reportRequest('/links','POST',{target:'https://example.org/password-brand-fixture'},undefined,201)).link;
  const passwordBrandPath='/links/'+passwordBrandLink.id+'/password-branding';
  let passwordBrand=await reportRequest(passwordBrandPath);
  passwordBrand=await reportRequest(passwordBrandPath,'PATCH',{version:passwordBrand.version,brandName:'Community & <friends>'});
  const passwordBrandVersion=passwordBrand.version;
  passwordBrand=await reportRequest(passwordBrandPath+'/logo','POST',{version:passwordBrand.version,image:env.REDIRECT_TEST_QR_LOGO});
  if(passwordBrand.brandName!=='Community & <friends>'||passwordBrand.logoAsset.mime!=='image/png'||!passwordBrand.logoAsset.url.startsWith('https://fixture.supabase.co/storage/v1/object/public/redirect-brand-assets/'))throw new Error('Password branding HTTP attachment failed');
  const passwordLogoKey=passwordBrand.logoAsset.key;
  if(Buffer.compare(Buffer.from(logoObjects.get(passwordLogoKey).bytes),Buffer.from(env.REDIRECT_TEST_QR_LOGO,'base64'))!==0)throw new Error('Password logo upload changed bytes');
  const passwordUploadCount=logoUploads;
  await reportRequest(passwordBrandPath+'/logo','POST',{version:passwordBrandVersion,image:env.REDIRECT_TEST_QR_LOGO},undefined,409);
  await reportRequest(passwordBrandPath+'/logo','POST',{version:passwordBrand.version,image:Buffer.from('<svg onload="private"></svg>').toString('base64')},undefined,400);
  if(logoUploads!==passwordUploadCount)throw new Error('Rejected password logo reached Storage');
  loseLogoReceipt=true;await reportRequest(passwordBrandPath+'/logo','POST',{version:passwordBrand.version,image:env.REDIRECT_TEST_QR_LOGO},undefined,503);
  if(logoUploads!==passwordUploadCount+1)throw new Error('Unknown password-logo upload retried');
  revokeLogoOwner=true;await reportRequest(passwordBrandPath+'/logo','POST',{version:passwordBrand.version,image:env.REDIRECT_TEST_QR_LOGO},undefined,403);
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[reportActor]);
  passwordBrand=await reportRequest(passwordBrandPath);
  if(passwordBrand.logoAsset.key!==passwordLogoKey)throw new Error('Lost receipt/owner replaced published password branding');
  const passwordPublic=(await db.query('SELECT public.redirect_password_branding_public($1) AS value',[passwordBrandLink.id])).rows[0].value;
  if(Object.keys(passwordPublic).sort().join(',')!=='brandName,logoAsset'||JSON.stringify(passwordPublic).includes('principal'))throw new Error('Public password branding leaked private metadata');
  const passwordAssets=(await db.query("SELECT id::text||CASE WHEN mime='image/png' THEN '.png' ELSE '.jpg' END AS key FROM public.redirect_qr_assets WHERE target_scope=$1",['password:'+passwordBrandLink.id])).rows.map(row=>row.key);
  await reportRequest('/links/'+passwordBrandLink.id,'DELETE');
  await db.query("UPDATE public.redirect_qr_assets SET expires_at=now()-interval '1 second',next_cleanup_at=now()-interval '1 second' WHERE target_scope=$1",['password:'+passwordBrandLink.id]);
  for(let clean=0;clean<8&&passwordAssets.some(key=>logoObjects.has(key));clean++)await policyRuntime.dispatchRedirectQrAssetCleanup(service,sdkArtworkStorage,fixtureDnsFetch);
  if(passwordAssets.some(key=>logoObjects.has(key)))throw new Error('Released/lost password-logo objects not physically cleaned');
  console.log('Password branding: five native SDK read/update/upload methods plus owner HTTP -> versioned reservation -> exact immutable Storage bytes -> current-role finish; stale/SVG preflight denial, no unknown upload replay, lost-owner denial, independent public profile and physical delete cleanup passed.');

  const setupDomain=await reportRequest('/domains','POST',{hostname:'go.setup-example.com'},undefined,201);
  const setupPath='/domains/'+setupDomain.id+'/dns-setup/';
  if((await reportRequest('/domains')).dnsSetup.configured)throw new Error('Missing signing key appeared configured');
  await reportRequest(setupPath+'discover','POST',{version:setupDomain.version},undefined,503);
  if(domainConnectDnsCalls)throw new Error('Unconfigured setup reached DNS');
  domainConnectEnabled=true;
  const dnsAvailability=(await reportRequest('/domains')).dnsSetup;
  if(!dnsAvailability.configured||dnsAvailability.cnameTarget!=='links.queer.guide'||Object.keys(dnsAvailability).sort().join(',')!=='cnameTarget,configured')throw new Error('DNS setup availability exposed signing configuration or wrong target');
  await reportRequest(setupPath+'discover','POST',{version:setupDomain.version},token,403);
  await reportRequest(setupPath+'discover','POST',{version:setupDomain.version,target:'https://evil.example.com'},undefined,400);
  const setup=await reportRequest(setupPath+'discover','POST',{version:setupDomain.version});
  if(setup.state!=='review'||setup.domain.ownershipVerified||setup.domain.providerConnected||setup.discovery.provider!=='cloudflare')throw new Error('Domain Connect discovery/review incorrect');
  const beforeRepeatedDiscovery=domainConnectDnsCalls;
  await reportRequest(setupPath+'discover','POST',{version:setupDomain.version},undefined,429);
  if(domainConnectDnsCalls!==beforeRepeatedDiscovery)throw new Error('Rate-limited discovery still reached DNS');
  await reportRequest('/domain-connect/'+setup.id,'GET',undefined,'fixture-other-account-session',404);
  const approval=await reportRequest(setupPath+'approve','POST',{version:setupDomain.version,operation:setup.id});
  const approvalUrl=new URL(approval.approvalUrl),approvalQuery=approvalUrl.searchParams;
  if(approvalUrl.origin!=='https://dash.cloudflare.com'||approvalUrl.pathname!=='/domainconnect/v2/domainTemplates/providers/queer.guide/services/redirects/apply'||approvalQuery.get('domain')!=='setup-example.com'||approvalQuery.get('host')!=='go'||approvalQuery.get('verification')!==setupDomain.verification.value.slice('qg-redirect='.length)||approvalQuery.get('key')!=='_fixture'||[...approvalQuery.keys()].at(-1)!=='sig')throw new Error('Approval URL escaped fixed template/host/challenge');
  const signedBytes=approvalUrl.search.slice(1).split('&key=')[0];
  if(!await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5',domainConnectKey.publicKey,Buffer.from(approvalQuery.get('sig'),'base64'),new TextEncoder().encode(signedBytes)))throw new Error('Actual HTTP approval signature did not verify');
  const callback=new URL(approvalQuery.get('redirect_uri'));
  if(callback.origin!=='https://queer.guide'||callback.searchParams.get('domain_connect')!==setup.id)throw new Error('Callback correlation escaped fixed origin');
  await reportRequest(setupPath+'approve','POST',{version:setupDomain.version,operation:setup.id},undefined,409);
  const lookup=await reportRequest('/domain-connect/'+setup.id);
  if(lookup.state!=='approved'||lookup.domain.ownershipVerified)throw new Error('Provider callback implied DNS ownership');
  dnsMissing=true;const beforeComplete=dnsCalls;
  const completed=await reportRequest(setupPath+'complete','POST',{version:setupDomain.version,operation:setup.id});
  dnsMissing=false;
  if(dnsCalls!==beforeComplete+1||completed.state!=='complete'||completed.outcome!=='missing'||completed.domain.ownershipVerified||completed.domain.routingReady)throw new Error('Callback skipped fresh DNS check or promoted readiness');
  await reportRequest(setupPath+'complete','POST',{version:completed.domain.version,operation:setup.id},undefined,409);
  // A fresh live-role check must reject a result arriving after owner removal.
  const lossDomain=await reportRequest('/domains','POST',{hostname:'lost.setup-example.com'},undefined,201);
  domainConnectLoseOwner=true;
  await reportRequest('/domains/'+lossDomain.id+'/dns-setup/discover','POST',{version:lossDomain.version},undefined,403);
  await db.query("INSERT INTO public.user_roles VALUES($1,'admin')",[reportActor]);
  if((await db.query('SELECT state FROM public.redirect_domain_connect_operations WHERE domain_id=$1',[lossDomain.id])).rows[0].state!=='discovering')throw new Error('Lost-owner discovery result published');
  const unsupportedDomain=await reportRequest('/domains','POST',{hostname:'unsupported.setup-example.com'},undefined,201);
  domainConnectTemplateMissing=true;
  const unsupportedSetup=await reportRequest('/domains/'+unsupportedDomain.id+'/dns-setup/discover','POST',{version:unsupportedDomain.version});
  domainConnectTemplateMissing=false;
  if(unsupportedSetup.state!=='unsupported')throw new Error('Missing provider template was treated as usable');
  await reportRequest('/domains/'+unsupportedDomain.id+'/dns-setup/approve','POST',{version:unsupportedDomain.version,operation:unsupportedSetup.id},undefined,409);
  console.log('Domain Connect: actual owner HTTP -> bounded discovery -> stored review -> verified RSA approval -> current-owner callback -> fresh TXT proof; key denial, budgets, template absence, replay and role loss passed.');

  const mailDomain=await reportRequest('/domains','POST',{hostname:'mail-forward.example.com'},undefined,201),mailPath='/domains/'+mailDomain.id+'/instructions';
  await reportRequest(mailPath,'GET',undefined,undefined,503);
  if((await reportRequest('/domains')).instructionMail.configured||instructionMailCalls)throw new Error('Unconfigured instruction mail appeared usable');
  instructionMailEnabled=true;
  const mailAvailability=(await reportRequest('/domains')).instructionMail;
  if(!mailAvailability.configured||Object.keys(mailAvailability).join(',')!=='configured')throw new Error('Instruction mail availability exposed delivery secret/sender');
  await reportRequest(mailPath,'GET',undefined,token,403);
  const mailDraft=await reportRequest(mailPath);
  if(mailDraft.records.length!==2||mailDraft.records[0].name!==mailDomain.hostname||mailDraft.records[0].value!=='links.queer.guide.'||mailDraft.records[1].value!==mailDomain.verification.value)throw new Error('Forwarded draft differs from current exact records');
  const mailInput={version:mailDraft.version,snapshot:mailDraft.snapshot,email:'DNS+setup@EXAMPLE.ORG',requestId:webcrypto.randomUUID()};
  await reportRequest(mailPath,'POST',{...mailInput,records:[]},undefined,400);
  await reportRequest(mailPath,'POST',{...mailInput,email:'dns@example.org,other@example.org'},undefined,400);
  await reportRequest(mailPath,'POST',{...mailInput,snapshot:'a'.repeat(64)},undefined,409);
  if(instructionMailCalls)throw new Error('Rejected mail input reached provider');
  const mailed=await reportRequest(mailPath,'POST',mailInput,undefined,202);
  if(mailed.state!=='sent'||mailed.canCancel||mailed.email!=='DNS+setup@example.org'||instructionMailCalls!==1)throw new Error('Instruction mail did not record exact provider acceptance');
  const mailMessage=JSON.parse([...instructionMailMessages.values()][0].body);
  if(mailMessage.to!=='dns+setup@example.org'||mailMessage.category!=='transactional'||!mailMessage.text.includes(mailDomain.verification.value)||!mailMessage.text.includes('Name: '+mailDomain.hostname)||!mailMessage.text.includes('sending this email does not complete those checks'))throw new Error('Native email body lost recipient, exact records or readiness distinction');
  const mailedAgain=await reportRequest(mailPath,'POST',mailInput,undefined,202);
  if(mailedAgain.id!==mailed.id||instructionMailCalls!==1)throw new Error('Request replay sent duplicate email');
  await reportRequest(mailPath,'POST',{...mailInput,email:'different@example.org'},undefined,409);
  await reportRequest(mailPath,'POST',{...mailInput,requestId:webcrypto.randomUUID()},undefined,429);
  const receiptPath='/domains/'+mailDomain.id+'/instruction-emails/'+mailed.id;
  await reportRequest(receiptPath,'GET',undefined,'fixture-other-account-session',404);
  const recovered=await reportRequest('/domains/'+mailDomain.id+'/instruction-emails?requestId='+mailInput.requestId);
  if(recovered.mail.id!==mailed.id||(await reportRequest(mailPath)).latestMail.id!==mailed.id)throw new Error('Owner receipt could not recover across reload/unknown HTTP response');
  const latestMailPath='/domains/'+mailDomain.id+'/instruction-emails';
  instructionMailEnabled=false;
  await db.query('UPDATE public.redirect_domains SET disabled=true,archived=true WHERE id=$1',[mailDomain.id]);
  if((await reportRequest(latestMailPath)).mail.id!==mailed.id||(await reportRequest(latestMailPath,'GET',undefined,'fixture-other-account-session')).mail!==null)throw new Error('Fresh-session inactive latest mail lost privacy/status');
  await reportRequest(latestMailPath,'GET',undefined,token,403);
  await reportRequest(latestMailPath+'?unexpected=true','GET',undefined,undefined,400);
  await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[reportActor]);
  await reportRequest(latestMailPath,'GET',undefined,undefined,403);
  await db.query("INSERT INTO public.user_roles VALUES($1,'admin')",[reportActor]);
  await db.query('UPDATE public.redirect_domains SET disabled=false,archived=false WHERE id=$1',[mailDomain.id]);
  instructionMailEnabled=true;
  await reportRequest(receiptPath+'/cancel','POST',{},undefined,409);
  const unknownMailDomain=await reportRequest('/domains','POST',{hostname:'unknown-mail.example.com'},undefined,201),unknownMailPath='/domains/'+unknownMailDomain.id+'/instructions';
  const unknownDraft=await reportRequest(unknownMailPath),unknownInput={version:unknownDraft.version,snapshot:unknownDraft.snapshot,email:'dns@example.org',requestId:webcrypto.randomUUID()};
  instructionMailMode='lost-receipt';const unknownReceipt=await reportRequest(unknownMailPath,'POST',unknownInput,undefined,202);
  if(unknownReceipt.state!=='queued'||unknownReceipt.canCancel)throw new Error('Lost receipt falsely marked failed/cancellable');
  const beforeUnknownRetry=instructionMailCalls,unknownBody=instructionMailMessages.get(await instructionIdentity(unknownReceipt.id)).body;
  await db.query("UPDATE public.redirect_domain_instruction_mail SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[unknownReceipt.id]);
  const knownReceipt=await reportRequest(unknownMailPath,'POST',unknownInput,undefined,202);
  if(knownReceipt.id!==unknownReceipt.id||knownReceipt.state!=='sent'||instructionMailCalls!==beforeUnknownRetry+1||instructionMailMessages.get(await instructionIdentity(unknownReceipt.id)).body!==unknownBody)throw new Error('Unknown delivery retry changed identity or persisted message');
  const cancelledDomain=await reportRequest('/domains','POST',{hostname:'cancel-mail.example.com'},undefined,201),cancelledPath='/domains/'+cancelledDomain.id+'/instructions';
  const cancelledDraft=await reportRequest(cancelledPath);instructionMailMode='throttled';
  const queuedMail=await reportRequest(cancelledPath,'POST',{version:cancelledDraft.version,snapshot:cancelledDraft.snapshot,email:'dns@example.org',requestId:webcrypto.randomUUID()},undefined,202);
  instructionMailMode='accepted';const beforeCancel=instructionMailCalls;
  const cancelledMail=await reportRequest('/domains/'+cancelledDomain.id+'/instruction-emails/'+queuedMail.id+'/cancel','POST',{});
  if(cancelledMail.state!=='cancelled')throw new Error('Unsent queued mail could not cancel');
  await db.query("UPDATE public.redirect_domain_instruction_mail SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[queuedMail.id]);
  await policyRuntime.dispatchDomainInstructionMail(service,await policyRuntime.domainInstructionMailConfig('fixture-mail-provider','Queer Guide <noreply@queer.guide>','links.queer.guide','https://email-gateway.fixture.invalid'),fixtureDnsFetch,queuedMail.id);
  if(instructionMailCalls!==beforeCancel)throw new Error('Cancelled mail was sent');
  const postflightDomain=await reportRequest('/domains','POST',{hostname:'postflight-mail.example.com'},undefined,201),postflightPath='/domains/'+postflightDomain.id+'/instructions',postflightDraft=await reportRequest(postflightPath);
  instructionMailLoseOwner=true;
  await reportRequest(postflightPath,'POST',{version:postflightDraft.version,snapshot:postflightDraft.snapshot,email:'dns@example.org',requestId:webcrypto.randomUUID()},undefined,403);
  await db.query("INSERT INTO public.user_roles VALUES($1,'admin')",[reportActor]);
  if((await reportRequest(postflightPath)).latestMail.state!=='sent')throw new Error('Owner loss after actual acceptance erased delivery truth');
  console.log('Native DNS instruction forwarding: actual owner HTTP -> reviewed current CNAME/TXT snapshot -> durable private queue -> exact persisted Cloudflare gateway fixture -> provider receipt, same-request replay/recovery, immutable unknown retry, cancellation and postflight role loss pass without real emails.');
  await verifyRedirectIntegrationHttp(db,base,reportActor);
  console.log(
    'Five SDKs passed; no external API calls, credentials, payments or production schema were used.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await artworkVerifierRuntime?.unregister();
  await db.close();
}
