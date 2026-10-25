<?php
require_once __DIR__.'/../php/RedirectsClient.php';
function check($value): void {if (!$value) throw new RuntimeException('Assertion failed');}
$api=new QueerGuide\RedirectsClient(getenv('REDIRECT_TEST_TOKEN'),getenv('REDIRECT_TEST_BASE'),workspaceId:getenv('REDIRECT_TEST_WORKSPACE'));
$sourcePage=$api->listInventory(['kind'=>'Client'],1);check(count($sourcePage['data'])===1 && $sourcePage['count']>0);
$sourceRecord=$sourcePage['data'][0];$sourceMetadata=$api->getInventoryMetadata($sourceRecord['id']);
$organizedSource=$api->organizeInventory([['id'=>$sourceRecord['id'],'version'=>$sourceMetadata['metadataVersion'],'values'=>['comment'=>'SDK source metadata']]]);
check($organizedSource['data'][0]['comment']==='SDK source metadata' && $organizedSource['data'][0]['metadataVersion']!==$sourceMetadata['metadataVersion']);
check($api->listDomainChoices()['count']===1);
check($api->listLinkedDomains()['count']===0);
$root=$api->createLink(['isDomainRoot'=>true,'domainId'=>getenv('REDIRECT_TEST_ROOT_DOMAIN'),'target'=>'https://example.org/home'])['link'];
check($root['isDomainRoot'] && $root['shortUrl']==='https://root-sdk.example.com/');
check($api->upsertLink(['isDomainRoot'=>true,'domainId'=>getenv('REDIRECT_TEST_ROOT_DOMAIN'),'target'=>'https://example.org/updated'])['link']['id']===$root['id']);
$api->deleteLink($root['id']);
$folder=$api->createResource('folders',['name'=>'Héllo & + PHP']);$tag=$api->createResource('tags',['name'=>'PHP tag','color'=>'pink']);
$template=$api->createResource('templates',['name'=>'PHP template','parameters'=>['utm_campaign'=>'Launch & +']]);
check($api->updateResource('folders',$folder['id'],['description'=>'Changed'])['description']==='Changed');
check($api->updateResource('tags',$tag['id'],['color'=>'blue'])['color']==='blue');check(count($api->listResources('templates')['data'])===1);
check($api->getResource('folders',$folder['id'])['name']==='Héllo & + PHP');
$created=$api->createLink(['target'=>'https://example.com/?q=a%26b#detail','slug'=>'sdk-php','startsAt'=>'2020-01-01T00:00:00Z','clickLimit'=>25,'notes'=>'SDK notes','folderId'=>$folder['id'],'tagIds'=>[$tag['id']]]);$id=$created['link']['id'];
check($api->getQrStyle($id)['style']['foreground']==='#111111');check($created['link']['clickLimit']===25 && $created['link']['notes']==='SDK notes' && $created['link']['startsAt']);
check($api->getQrStyle($id)['style']['foreground']==='#111111');
$qrImage=$api->createQrImage(['linkId'=>$id,'logo'=>getenv('REDIRECT_TEST_QR_LOGO')]);
check($qrImage['state']==='published' && $qrImage['logoMode']==='custom' && $qrImage['logoAsset']['url']);
check(str_starts_with($qrImage['imageUrls']['png'],'https://queer.guide/api/qr?share=qg_qr_'));
check(count(array_filter($api->listQrImages()['data'],fn($row)=>$row['id']===$qrImage['id']))===1);
check((bool)$api->revokeQrImage($qrImage['id'],$qrImage['version'])['revokedAt']);
$art=$api->uploadPreviewImage($id,getenv('REDIRECT_TEST_IMAGE'));$api->updatePresentation($id,['preview'=>['title'=>'SDK preview','image'=>$art['image'],'video'=>'https://example.com/a.mp4'],'cloaked'=>true]);check($api->getPresentation($id)['preview']['title']==='SDK preview');
$api->updatePolicy($id,['policy'=>['track_conversions'=>true,'geo_targets'=>['CH'=>'/switzerland']],'password'=>'fixture-sdk-password']);
$policy=$api->getPolicy($id);check($policy['hasPassword']===true);check($policy['policy']['preview']['title']==='SDK preview');check(!str_contains(json_encode($policy),'password_hash'));check(!str_contains(json_encode($policy),'fixture-sdk-password'));
$api->updatePolicy($id,['policy'=>['geo_targets'=>null],'password'=>null]);$policy=$api->getPolicy($id);check($policy['hasPassword']===false);check($policy['policy']['track_conversions']===true);check(!array_key_exists('geo_targets',$policy['policy']));
$api->updateLink($id,['comment'=>'SDK update','isEnabled'=>false]);check($api->getLink($id)['folderId']===$folder['id']);
check($api->upsertLink(['slug'=>'sdk-php','target'=>'/updated'])['created']===false);check($api->countLinks(['ids'=>[$id]])['count']===1);
check(count(iterator_to_array($api->iterateLinks(['search'=>'sdk-page-']),false))===101);
$batch=$api->bulk([['operation'=>'update','id'=>$id,'data'=>['comment'=>'Batch']],['operation'=>'create','data'=>['target'=>'/events']]]);$api->deleteLink($batch['data'][1]['link']['id']);
$lead=['clickId'=>getenv('REDIRECT_TEST_CLICK'),'customerExternalId'=>'sdk:php/customer & ü','eventId'=>'sdk-lead:php'];$api->trackLead($lead);check($api->trackLead($lead)['duplicate']===true);
$api->trackSale(array_merge($lead,['eventId'=>'sdk-sale:php','amount'=>'49.900001','currency'=>'CHF']));
check($api->analytics(['country'=>'CH'])['totals']);check(count($api->events([],['limit'=>1])['data'])===1);

$branding=$api->getPasswordBranding($id);check($branding['version']===null);
$branding=$api->updatePasswordBranding($id,['version'=>null,'brandName'=>'PHP public brand']);
$branding=$api->uploadPasswordLogo($id,$branding['version'],getenv('REDIRECT_TEST_QR_LOGO'));check($branding['logoAsset']['mime']==='image/png'&&$branding['brandName']==='PHP public brand');
check($api->updatePasswordBranding($id,['version'=>$branding['version'],'clearLogo'=>true])['logoAsset']===null);
$api->deleteLink($id);foreach ([['folders',$folder],['tags',$tag],['templates',$template]] as [$kind,$item]) $api->deleteResource($kind,$item['id']);
foreach ([['/redirect-probe',302],['/limited-probe',429]] as [$path,$status]) {try {$api->request('GET',$path);throw new RuntimeException('Expected API error');} catch (QueerGuide\RedirectApiError $error) {check($error->status===$status);if ($status===429) check($error->retryAfter==='17');}}
try {new QueerGuide\RedirectsClient('token','http://example.com/api');throw new RuntimeException('Insecure base accepted');} catch (InvalidArgumentException) {}
$account=new QueerGuide\RedirectsClient(getenv('REDIRECT_TEST_SESSION'),getenv('REDIRECT_TEST_BASE'),workspaceId:getenv('REDIRECT_TEST_WORKSPACE'));
check($account->getSession()['workspace']['id']===getenv('REDIRECT_TEST_WORKSPACE'));
check($account->listWorkspaces()['currentWorkspaceId']===getenv('REDIRECT_TEST_WORKSPACE'));
check($account->listWorkspaces(100)['data']===[]);
$integrationHex=bin2hex(random_bytes(16));$integrationRequest=substr($integrationHex,0,8).'-'.substr($integrationHex,8,4).'-'.substr($integrationHex,12,4).'-'.substr($integrationHex,16,4).'-'.substr($integrationHex,20,12);
$integrationInput=['requestId'=>$integrationRequest,'provider'=>'gtm','name'=>'PHP integration setup','linkIds'=>[getenv('REDIRECT_TEST_REPORT_LINK')],'expiresAt'=>gmdate('Y-m-d\TH:i:s\Z',time()+86400)];
$integrationSetup=$account->createIntegrationSetup($integrationInput);check($integrationSetup['created'] && str_starts_with($integrationSetup['credential'],'qg_redirect_'));
check($account->createIntegrationSetup($integrationInput)['credential']===null);
check($account->lookupIntegrationSetup($integrationRequest)['installation']['id']===$integrationSetup['installation']['id']);
check($account->lookupIntegrationSetup('00000000-0000-4000-8000-000000000000')['installation']===null);
check(in_array($integrationSetup['installation']['id'],array_column($account->listIntegrationSetups()['data'],'id'),true));
check($account->revokeIntegrationSetup($integrationSetup['installation']['id'])['status']==='revoked');
try {$api->listIntegrationSetups();throw new RuntimeException('Key read account integration setups');}catch(QueerGuide\RedirectApiError $error){check($error->status===403);}
foreach (['domains','tokens','webhooks'] as $kind) check(is_array($account->listWorkspaceInformation($kind,1)['data']));
try {$api->listWorkspaceInformation('tokens');throw new RuntimeException('Key read account metadata');} catch(QueerGuide\RedirectApiError $error) {check($error->status===403);}
try {(new QueerGuide\RedirectsClient(getenv('REDIRECT_TEST_TOKEN'),getenv('REDIRECT_TEST_BASE'),workspaceId:'00000000-0000-4000-8000-000000000777'))->listLinks();throw new RuntimeException('Unavailable workspace accepted');} catch(QueerGuide\RedirectApiError $error) {check($error->status===403);}
try {new QueerGuide\RedirectsClient('fixture',workspaceId:"bad\r\nInjected: header");throw new RuntimeException('Invalid workspace accepted');} catch(InvalidArgumentException $error) {}
$other=new QueerGuide\RedirectsClient(getenv('REDIRECT_TEST_OTHER_SESSION'),getenv('REDIRECT_TEST_BASE'));
function reportError(callable $action,int $status): void {try {$action();throw new RuntimeException('Expected report error');}catch(QueerGuide\RedirectApiError $error){check($error->status===$status);}}
reportError(fn()=>$api->listReports(),403);
$report=$account->createReport(['name'=>'SDK PHP report','filters'=>['linkIds'=>[getenv('REDIRECT_TEST_REPORT_LINK')]]]);
$second=$account->createReport(['name'=>'SDK PHP second','filters'=>['linkIds'=>[getenv('REDIRECT_TEST_REPORT_LINK')]]]);
check($account->getReport($report['id'])['name']===$report['name']);
$page=$account->listReports(1);check(count($page['data'])===1&&$page['nextCursor']);check(count($account->listReports(1,$page['nextCursor'])['data'])===1);
reportError(fn()=>$other->getReport($report['id']),404);check($other->listReports()['count']===0);
$report=$account->updateReport($report['id'],['version'=>$report['version'],'visibility'=>'team']);
check($other->listReports(50,null,'team')['data'][0]['canEdit']===false);
reportError(fn()=>$other->updateReport($report['id'],['version'=>$report['version'],'name'=>'Denied team edit']),404);
$report=$account->updateReport($report['id'],['version'=>$report['version'],'visibility'=>'private']);
check($other->listReports(50,null,'team')['count']===0);
$oldVersion=$report['version'];$report=$account->updateReport($report['id'],['version'=>$oldVersion,'name'=>'Reviewed PHP report']);
reportError(fn()=>$account->updateReport($report['id'],['version'=>$oldVersion,'name'=>'Stale']),409);
$aggregate=$account->runReport($report['id']);check($aggregate['totals']['clicks']===1&&is_string($aggregate['revenue'][0]['amount']));
$share=$account->createReportShare($report['id'],['title'=>'PHP shared','reportVersion'=>$report['version'],'expiresAt'=>null]);
check($account->listReportShares($report['id'])['data'][0]['id']===$share['id']);
$reader=new QueerGuide\RedirectsClient('qg_report_'.$share['id'],getenv('REDIRECT_TEST_BASE'));
check($reader->readPublicReport()['report']['totals']['clicks']===1);
check($reader->readPublicReport([])['report']['totals']['clicks']===1);
check($reader->readPublicReport(['dates'=>[]])['report']['totals']['clicks']===1);
check($reader->readPublicReport(['dates'=>['start'=>'2020-01-01T00:00:00Z','end'=>'2020-01-02T00:00:00Z']])['report']['totals']['clicks']===0);
check($account->revokeReportShare($report['id'],$share['id'])['revoked']);reportError(fn()=>$reader->readPublicReport(),404);
$guarded=$account->createReportShare($report['id'],['title'=>'PHP protected','reportVersion'=>$report['version'],'password'=>'sdk-report-password','includeConversions'=>true,'expiresAt'=>null]);
$protected=new QueerGuide\RedirectsClient('qg_report_'.$guarded['id'],getenv('REDIRECT_TEST_BASE'));
reportError(fn()=>$protected->readPublicReport(),401);
check(is_string($protected->readPublicReport(['password'=>'sdk-report-password'])['report']['revenue'][0]['amount']));
check($account->deleteReport($report['id'])['deleted']);reportError(fn()=>$protected->readPublicReport(['password'=>'sdk-report-password']),404);
$account->deleteReport($second['id']);

$emptyReport=$account->createReport(['name'=>'PHP all-link filters','filters'=>[]]);
$emptyReport=$account->updateReport($emptyReport['id'],['version'=>$emptyReport['version'],'filters'=>[]]);
check(is_array($account->runReport($emptyReport['id'])['totals']));
$account->deleteReport($emptyReport['id']);

$customer=$api->getCustomer($lead['customerExternalId']);check($customer['version']===null&&$customer['canEdit']);
$customer=$api->updateCustomer($lead['customerExternalId'],['version'=>null,'name'=>'SDK PHP identity','email'=>'php@example.com','avatarUrl'=>'https://example.com/avatar.png']);
check($api->getCustomer($lead['customerExternalId'])['name']==='SDK PHP identity');
reportError(fn()=>$api->updateCustomer($lead['customerExternalId'],['version'=>null,'name'=>'Stale identity']),409);
$page=$api->customerJourney($lead['customerExternalId'],1);check(count($page['data'])===1&&$page['nextCursor']);check(count($api->customerJourney($lead['customerExternalId'],1,$page['nextCursor'])['data'])===1);
$identityVersion=$customer['version'];$customer=$api->clearCustomer($lead['customerExternalId'],$identityVersion);
check($customer['name']===null&&$customer['email']===null&&$customer['avatarUrl']===null&&$customer['version']!==$identityVersion);
check(count($api->customerJourney($lead['customerExternalId'])['data'])===3);

$webhook=$account->createWebhook(['name'=>'PHP receiver','url'=>'https://receiver.example.org/events']);check(str_starts_with($webhook['secret'],'whsec_'));
check(!isset($account->getWebhook($webhook['id'])['secret']));check(count($account->listWebhooks()['data'])>=1);
$webhook=$account->updateWebhook($webhook['id'],['version'=>$webhook['version'],'name'=>'PHP updated']);
$webhook=$account->rotateWebhookSecret($webhook['id'],$webhook['version']);check($webhook['previousKeyExpiresAt']);
$queued=$account->testWebhook($webhook['id'],$webhook['version']);check($queued['queued']);
$delivery=$account->getWebhookDelivery($webhook['id'],$queued['deliveryId']);check(json_decode($delivery['body'],true)['type']==='webhook.test');
check($account->listWebhookDeliveries($webhook['id'])['data'][0]['id']===$delivery['id']);check($account->listWebhookAttempts($webhook['id'],$delivery['id'])['data']===[]);
$webhook=$account->archiveWebhook($webhook['id'],$webhook['version']);check($webhook['deletedAt']);
$webhook=$account->updateWebhook($webhook['id'],['version'=>$webhook['version'],'restore'=>true,'enabled'=>true]);
$delivery=$account->getWebhookDelivery($webhook['id'],$delivery['id']);check($account->replayWebhookDelivery($webhook['id'],$delivery['id'],$delivery['version'])['state']==='queued');
$account->archiveWebhook($webhook['id'],$webhook['version']);

$fixture=json_decode(file_get_contents(__DIR__.'/webhook-fixture.json'),true);
check(QueerGuide\RedirectsClient::verifyWebhook($fixture['secret'],$fixture['body'],$fixture['id'],$fixture['timestamp'],$fixture['signature'],1700000000));
check(!QueerGuide\RedirectsClient::verifyWebhook($fixture['secret'],$fixture['body'].' ',$fixture['id'],$fixture['timestamp'],$fixture['signature'],1700000000));
check(!QueerGuide\RedirectsClient::verifyWebhook($fixture['secret'],$fixture['body'],$fixture['id'],$fixture['timestamp'],$fixture['signature'],1700000301));
check(QueerGuide\RedirectsClient::verifyWebhook($fixture['secret'],$fixture['body'],$fixture['id'],$fixture['timestamp'],'v1,'.str_repeat('A',43).'= '.$fixture['signature'],1700000000));
