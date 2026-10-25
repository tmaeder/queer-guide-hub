import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {RedirectsClient,RedirectApiError,verifyWebhook} from '../../../tmp/sdk-tests/typescript.mjs';
const api=new RedirectsClient(process.env.REDIRECT_TEST_TOKEN,{baseUrl:process.env.REDIRECT_TEST_BASE,workspaceId:process.env.REDIRECT_TEST_WORKSPACE});
const sourcePage=await api.listInventory({kind:'Client'},1);assert.equal(sourcePage.data.length,1);assert.ok(sourcePage.count>0);
const sourceRecord=sourcePage.data[0],sourceMetadata=await api.getInventoryMetadata(sourceRecord.id);
const organizedSource=await api.organizeInventory([{id:sourceRecord.id,version:sourceMetadata.metadataVersion,values:{comment:'SDK source metadata'}}]);assert.equal(organizedSource.data[0].comment,'SDK source metadata');assert.notEqual(organizedSource.data[0].metadataVersion,sourceMetadata.metadataVersion);
assert.equal((await api.listDomainChoices()).count,1);
assert.equal((await api.listLinkedDomains()).count,0);
const root=await api.createLink({isDomainRoot:true,domainId:process.env.REDIRECT_TEST_ROOT_DOMAIN,target:'https://example.org/home'});
assert.equal(root.link.shortUrl,'https://root-sdk.example.com/');assert.equal(root.link.isDomainRoot,true);
assert.equal((await api.upsertLink({isDomainRoot:true,domainId:process.env.REDIRECT_TEST_ROOT_DOMAIN,target:'https://example.org/updated'})).link.id,root.link.id);
await api.deleteLink(root.link.id);
const folder=await api.createResource('folders',{name:'Héllo & + TS'}),tag=await api.createResource('tags',{name:'TS tag',color:'pink'});
const template=await api.createResource('templates',{name:'TS template',parameters:{utm_campaign:'Launch & +'}});
assert.equal((await api.updateResource('folders',folder.id,{description:'Changed'})).description,'Changed');
assert.equal((await api.updateResource('tags',tag.id,{color:'blue'})).color,'blue');
assert.equal((await api.listResources('templates')).data.length,1);
assert.equal((await api.getResource('folders',folder.id)).name,'Héllo & + TS');
const created=await api.createLink({target:'https://example.com/?q=a%26b#detail',slug:'sdk-typescript',startsAt:'2020-01-01T00:00:00Z',clickLimit:25,notes:'SDK notes',folderId:folder.id,tagIds:[tag.id]});
const id=created.link.id;assert.equal((await api.getQrStyle(id)).style.foreground,'#111111');assert.equal(created.link.clickLimit,25);assert.equal(created.link.notes,'SDK notes');assert.ok(created.link.startsAt);
assert.equal((await api.getQrStyle(id)).style.foreground,'#111111');
const qrImage=await api.createQrImage({linkId:id,logo:process.env.REDIRECT_TEST_QR_LOGO});
assert.equal(qrImage.state,'published');assert.equal(qrImage.logoMode,'custom');assert.ok(qrImage.logoAsset.url);
assert.equal(new URL(qrImage.imageUrls.png).pathname,'/api/qr');assert.match(new URL(qrImage.imageUrls.png).searchParams.get('share'),/^qg_qr_[a-f0-9]{64}$/);
assert.ok((await api.listQrImages()).data.some(row=>row.id===qrImage.id));
assert.ok((await api.revokeQrImage(qrImage.id,qrImage.version)).revokedAt);
const art=await api.uploadPreviewImage(id,process.env.REDIRECT_TEST_IMAGE);await api.updatePresentation(id,{preview:{title:'SDK preview',image:art.image,video:'https://example.com/a.mp4'},cloaked:true});assert.equal((await api.getPresentation(id)).preview.title,'SDK preview');
await api.updatePolicy(id,{policy:{track_conversions:true,geo_targets:{CH:'/switzerland'}},password:'fixture-sdk-password'});
let policy=await api.getPolicy(id);assert.equal(policy.hasPassword,true);assert.equal(policy.policy.preview.title,'SDK preview');assert.equal(JSON.stringify(policy).includes('password_hash'),false);assert.equal(JSON.stringify(policy).includes('fixture-sdk-password'),false);
await api.updatePolicy(id,{policy:{geo_targets:null},password:null});policy=await api.getPolicy(id);assert.equal(policy.hasPassword,false);assert.equal(policy.policy.track_conversions,true);assert.equal(policy.policy.geo_targets,undefined);
await api.updateLink(id,{comment:'SDK update',isEnabled:false});
assert.equal((await api.getLink(id)).folderId,folder.id);
assert.equal((await api.upsertLink({slug:'sdk-typescript',target:'/updated'})).created,false);
assert.equal((await api.countLinks({ids:[id]})).count,1);
let count=0;for await(const row of api.iterateLinks({search:'sdk-page-'})){assert.match(row.slug,/^sdk-page-/);count++;}assert.equal(count,101);
const batch=await api.bulk([{operation:'update',id,data:{comment:'Batch'}},{operation:'create',data:{target:'/events'}}]);
await api.deleteLink(batch.data[1].link.id);
const lead={clickId:process.env.REDIRECT_TEST_CLICK,customerExternalId:'sdk:typescript/customer & ü',eventId:'sdk-lead:typescript'};
await api.trackLead(lead);assert.equal((await api.trackLead(lead)).duplicate,true);
await api.trackSale({...lead,eventId:'sdk-sale:typescript',amount:'49.900001',currency:'CHF'});
assert.ok((await api.analytics({country:'CH'})).totals);
assert.ok((await api.events({}, {limit:1})).data.length);

let branding=await api.getPasswordBranding(id);assert.equal(branding.version,null);
branding=await api.updatePasswordBranding(id,{version:null,brandName:'TS public brand'});
branding=await api.uploadPasswordLogo(id,branding.version,process.env.REDIRECT_TEST_QR_LOGO);assert.equal(branding.logoAsset.mime,'image/png');assert.equal(branding.brandName,'TS public brand');
assert.ok((await api.updatePasswordBranding(id,{version:branding.version,clearLogo:true})).logoAsset===null);
await api.deleteLink(id);for(const [kind,item] of [['folders',folder],['tags',tag],['templates',template]])await api.deleteResource(kind,item.id);
for(const [path,status] of [['/redirect-probe',302],['/limited-probe',429]]){await assert.rejects(api.request('GET',path),error=>error instanceof RedirectApiError&&error.status===status&&(status!==429||error.retryAfter==='17'));}
assert.throws(()=>new RedirectsClient('token',{baseUrl:'http://example.com/api'}));
const account=new RedirectsClient(process.env.REDIRECT_TEST_SESSION,{baseUrl:process.env.REDIRECT_TEST_BASE,workspaceId:process.env.REDIRECT_TEST_WORKSPACE});
assert.equal((await account.getSession()).workspace.id,process.env.REDIRECT_TEST_WORKSPACE);
assert.equal((await account.listWorkspaces()).currentWorkspaceId,process.env.REDIRECT_TEST_WORKSPACE);
const integrationInput = {
  requestId: crypto.randomUUID(),
  provider: 'segment',
  name: 'TS integration setup',
  linkIds: [process.env.REDIRECT_TEST_REPORT_LINK],
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
const integrationSetup = await account.createIntegrationSetup(integrationInput);
assert.equal(integrationSetup.created, true);
assert.match(integrationSetup.credential, /^qg_redirect_[a-f0-9]{64}$/);
assert.equal((await account.createIntegrationSetup(integrationInput)).credential, null);
assert.equal(
  (await account.lookupIntegrationSetup(integrationInput.requestId)).installation.id,
  integrationSetup.installation.id,
);
assert.equal((await account.lookupIntegrationSetup(crypto.randomUUID())).installation, null);
assert.ok(
  (await account.listIntegrationSetups()).data.some(
    (row) => row.id === integrationSetup.installation.id,
  ),
);
assert.equal(
  (await account.revokeIntegrationSetup(integrationSetup.installation.id)).status,
  'revoked',
);
await assert.rejects(api.listIntegrationSetups(), (error) => error.status === 403);
for(const kind of ['domains','tokens','webhooks'])assert.ok(Array.isArray((await account.listWorkspaceInformation(kind,1)).data));
await assert.rejects(api.listWorkspaceInformation('tokens'),error=>error.status===403);
const unavailableWorkspace=new RedirectsClient(process.env.REDIRECT_TEST_TOKEN,{baseUrl:process.env.REDIRECT_TEST_BASE,workspaceId:'00000000-0000-4000-8000-000000000777'});
await assert.rejects(unavailableWorkspace.listLinks(),error=>error instanceof RedirectApiError&&error.status===403);
assert.throws(()=>new RedirectsClient('fixture',{workspaceId:'bad\r\nInjected: header'}));
const otherAccount=new RedirectsClient(process.env.REDIRECT_TEST_OTHER_SESSION,{baseUrl:process.env.REDIRECT_TEST_BASE});
await assert.rejects(api.listReports(),error=>error instanceof RedirectApiError&&error.status===403);
let report=await account.createReport({name:'SDK TS report',filters:{linkIds:[process.env.REDIRECT_TEST_REPORT_LINK]}});
const report2=await account.createReport({name:'SDK TS second',filters:{linkIds:[process.env.REDIRECT_TEST_REPORT_LINK]}});
assert.equal((await account.getReport(report.id)).name,report.name);
let reportPage=await account.listReports(1);assert.equal(reportPage.data.length,1);assert.ok(reportPage.nextCursor);
assert.equal((await account.listReports(1,reportPage.nextCursor)).data.length,1);
await assert.rejects(otherAccount.getReport(report.id),error=>error.status===404);
assert.equal((await otherAccount.listReports()).count,0);
report=await account.updateReport(report.id,{version:report.version,visibility:'team'});
assert.equal((await otherAccount.listReports(50,undefined,'team')).data[0].canEdit,false);
await assert.rejects(otherAccount.updateReport(report.id,{version:report.version,name:'Denied team edit'}),error=>error.status===404);
report=await account.updateReport(report.id,{version:report.version,visibility:'private'});
assert.equal((await otherAccount.listReports(50,undefined,'team')).count,0);
const oldReportVersion=report.version;
report=await account.updateReport(report.id,{version:report.version,name:'Reviewed TS report'});
await assert.rejects(account.updateReport(report.id,{version:oldReportVersion,name:'Stale'}),error=>error.status===409);
const aggregates=await account.runReport(report.id);assert.equal(aggregates.totals.clicks,1);assert.equal(typeof aggregates.revenue[0].amount,'string');
const share=await account.createReportShare(report.id,{title:'TS shared report',reportVersion:report.version,expiresAt:null});
assert.equal((await account.listReportShares(report.id)).data[0].id,share.id);
const publicReader=new RedirectsClient('qg_report_'+share.id,{baseUrl:process.env.REDIRECT_TEST_BASE});
assert.equal((await publicReader.readPublicReport()).report.totals.clicks,1);
assert.equal((await publicReader.readPublicReport({dates:{start:'2020-01-01T00:00:00Z',end:'2020-01-02T00:00:00Z'}})).report.totals.clicks,0);
assert.equal((await account.revokeReportShare(report.id,share.id)).revoked,true);
await assert.rejects(publicReader.readPublicReport(),error=>error.status===404);
const guardedShare=await account.createReportShare(report.id,{title:'TS protected',reportVersion:report.version,password:'sdk-report-password',includeConversions:true,expiresAt:null});
const guardedReader=new RedirectsClient('qg_report_'+guardedShare.id,{baseUrl:process.env.REDIRECT_TEST_BASE});
await assert.rejects(guardedReader.readPublicReport(),error=>error.status===401);
assert.equal(typeof(await guardedReader.readPublicReport({password:'sdk-report-password'})).report.revenue[0].amount,'string');
assert.equal((await account.deleteReport(report.id)).deleted,true);
await assert.rejects(guardedReader.readPublicReport({password:'sdk-report-password'}),error=>error.status===404);
await account.deleteReport(report2.id);

let customer=await api.getCustomer(lead.customerExternalId);assert.equal(customer.version,null);assert.equal(customer.canEdit,true);
customer=await api.updateCustomer(lead.customerExternalId,{version:null,name:'SDK TS identity',email:'typescript@example.com',avatarUrl:'https://example.com/avatar.png'});
assert.equal((await api.getCustomer(lead.customerExternalId)).name,'SDK TS identity');
await assert.rejects(api.updateCustomer(lead.customerExternalId,{version:null,name:'Stale identity'}),error=>error.status===409);
let customerPage=await api.customerJourney(lead.customerExternalId,1);assert.equal(customerPage.data.length,1);assert.ok(customerPage.nextCursor);
assert.equal((await api.customerJourney(lead.customerExternalId,1,customerPage.nextCursor)).data.length,1);
const identityVersion=customer.version;customer=await api.clearCustomer(lead.customerExternalId,identityVersion);
assert.equal(customer.name,null);assert.equal(customer.email,null);assert.equal(customer.avatarUrl,null);assert.notEqual(customer.version,identityVersion);
assert.equal((await api.customerJourney(lead.customerExternalId)).data.length,3);

let webhook=await account.createWebhook({name:'TS receiver',url:'https://receiver.example.org/events'});assert.match(webhook.secret,/^whsec_/);
assert.equal((await account.getWebhook(webhook.id)).secret,undefined);assert.ok((await account.listWebhooks(50)).data.some(row=>row.id===webhook.id));
const webhookVersion=webhook.version;webhook=await account.updateWebhook(webhook.id,{version:webhook.version,name:'TS updated'});
await assert.rejects(account.updateWebhook(webhook.id,{version:webhookVersion,name:'Stale'}),error=>error.status===409);
webhook=await account.rotateWebhookSecret(webhook.id,webhook.version);assert.ok(webhook.previousKeyExpiresAt);
const webhookTest=await account.testWebhook(webhook.id,webhook.version);assert.equal(webhookTest.queued,true);
assert.equal((await account.listWebhookDeliveries(webhook.id)).data[0].id,webhookTest.deliveryId);
let delivery=await account.getWebhookDelivery(webhook.id,webhookTest.deliveryId);assert.equal(JSON.parse(delivery.body).type,'webhook.test');assert.equal((await account.listWebhookAttempts(webhook.id,delivery.id)).data.length,0);
webhook=await account.archiveWebhook(webhook.id,webhook.version);assert.ok(webhook.deletedAt);
webhook=await account.updateWebhook(webhook.id,{version:webhook.version,restore:true,enabled:true});
delivery=await account.getWebhookDelivery(webhook.id,delivery.id);assert.equal(delivery.state,'cancelled');assert.equal((await account.replayWebhookDelivery(webhook.id,delivery.id,delivery.version)).state,'queued');
await account.archiveWebhook(webhook.id,webhook.version);

const signatureFixture=JSON.parse(readFileSync(new URL('./webhook-fixture.json',import.meta.url),'utf8'));
const signatureHeaders={id:signatureFixture.id,timestamp:signatureFixture.timestamp,signature:signatureFixture.signature};
assert.equal(await verifyWebhook(signatureFixture.secret,signatureFixture.body,signatureHeaders,1700000000),true);
assert.equal(await verifyWebhook(signatureFixture.secret,signatureFixture.body+' ',signatureHeaders,1700000000),false);
assert.equal(await verifyWebhook(signatureFixture.secret,signatureFixture.body,signatureHeaders,1700000301),false);
assert.equal(await verifyWebhook(signatureFixture.secret,signatureFixture.body,{...signatureHeaders,signature:'v1,'+'A'.repeat(43)+'= '+signatureFixture.signature},1700000000),true);
