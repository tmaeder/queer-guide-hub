import json
import uuid
from datetime import datetime, timezone, timedelta
import os, sys
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'../python'))
from redirects import RedirectsClient, RedirectApiError, verify_webhook
api=RedirectsClient(os.environ['REDIRECT_TEST_TOKEN'],os.environ['REDIRECT_TEST_BASE'],workspace_id=os.environ['REDIRECT_TEST_WORKSPACE'])
source_page=api.list_inventory({'kind':'Client'},limit=1)
assert len(source_page['data'])==1 and source_page['count']>0
source_record=source_page['data'][0];source_metadata=api.get_inventory_metadata(source_record['id'])
organized_source=api.organize_inventory([{'id':source_record['id'],'version':source_metadata['metadataVersion'],'values':{'comment':'SDK source metadata'}}])
assert organized_source['data'][0]['comment']=='SDK source metadata' and organized_source['data'][0]['metadataVersion']!=source_metadata['metadataVersion']
assert api.list_domain_choices()['count']==1
assert api.list_linked_domains()['count']==0
root=api.create_link({'isDomainRoot':True,'domainId':os.environ['REDIRECT_TEST_ROOT_DOMAIN'],'target':'https://example.org/home'})['link']
assert root['isDomainRoot'] and root['shortUrl']=='https://root-sdk.example.com/'
assert api.upsert_link({'isDomainRoot':True,'domainId':os.environ['REDIRECT_TEST_ROOT_DOMAIN'],'target':'https://example.org/updated'})['link']['id']==root['id']
api.delete_link(root['id'])
folder=api.create_resource('folders',{'name':'Héllo & + Python'})
tag=api.create_resource('tags',{'name':'Python tag','color':'pink'})
template=api.create_resource('templates',{'name':'Python template','parameters':{'utm_campaign':'Launch & +'}})
assert api.update_resource('folders',folder['id'],{'description':'Changed'})['description']=='Changed'
assert api.update_resource('tags',tag['id'],{'color':'blue'})['color']=='blue'
assert len(api.list_resources('templates')['data'])==1
assert api.get_resource('folders',folder['id'])['name']=='Héllo & + Python'
created=api.create_link({'target':'https://example.com/?q=a%26b#detail','slug':'sdk-python','startsAt':'2020-01-01T00:00:00Z','clickLimit':25,'notes':'SDK notes','folderId':folder['id'],'tagIds':[tag['id']]})
id=created['link']['id']
assert api.get_qr_style(id)['style']['foreground']=='#111111'
assert created['link']['clickLimit']==25 and created['link']['notes']=='SDK notes' and created['link']['startsAt']
qr_image=api.create_qr_image({'linkId':id,'logo':os.environ['REDIRECT_TEST_QR_LOGO']})
assert qr_image['state']=='published' and qr_image['logoMode']=='custom' and qr_image['logoAsset']['url']
assert qr_image['imageUrls']['png'].startswith('https://queer.guide/api/qr?share=qg_qr_')
assert any(row['id']==qr_image['id'] for row in api.list_qr_images()['data'])
assert api.revoke_qr_image(qr_image['id'],qr_image['version'])['revokedAt']
art=api.upload_preview_image(id,os.environ['REDIRECT_TEST_IMAGE']);api.update_presentation(id,{'preview':{'title':'SDK preview','image':art['image'],'video':'https://example.com/a.mp4'},'cloaked':True});assert api.get_presentation(id)['preview']['title']=='SDK preview'
api.update_policy(id,{'policy':{'track_conversions':True,'geo_targets':{'CH':'/switzerland'}},'password':'fixture-sdk-password'})
policy=api.get_policy(id);assert policy['hasPassword'] is True;assert policy['policy']['preview']['title']=='SDK preview';assert 'password_hash' not in str(policy);assert 'fixture-sdk-password' not in str(policy)
api.update_policy(id,{'policy':{'geo_targets':None},'password':None});policy=api.get_policy(id);assert policy['hasPassword'] is False;assert policy['policy']['track_conversions'] is True;assert 'geo_targets' not in policy['policy']
api.update_link(id,{'comment':'SDK update','isEnabled':False})
assert api.get_link(id)['folderId']==folder['id']
assert api.upsert_link({'slug':'sdk-python','target':'/updated'})['created'] is False
assert api.count_links({'ids':[id]})['count']==1
assert len(list(api.iterate_links({'search':'sdk-page-'})))==101
batch=api.bulk([{'operation':'update','id':id,'data':{'comment':'Batch'}},{'operation':'create','data':{'target':'/events'}}])
api.delete_link(batch['data'][1]['link']['id'])
lead={'clickId':os.environ['REDIRECT_TEST_CLICK'],'customerExternalId':'sdk:python/customer & ü','eventId':'sdk-lead:python'}
api.track_lead(lead)
assert api.track_lead(lead)['duplicate'] is True
api.track_sale({**lead,'eventId':'sdk-sale:python','amount':'49.900001','currency':'CHF'})
assert api.analytics({'country':'CH'})['totals']
assert api.events(limit=1)['data']

branding=api.get_password_branding(id);assert branding['version'] is None
branding=api.update_password_branding(id,{'version':None,'brandName':'Python public brand'})
branding=api.upload_password_logo(id,branding['version'],os.environ['REDIRECT_TEST_QR_LOGO']);assert branding['logoAsset']['mime']=='image/png' and branding['brandName']=='Python public brand'
assert api.update_password_branding(id,{'version':branding['version'],'clearLogo':True})['logoAsset'] is None
api.delete_link(id)
for kind,item in [('folders',folder),('tags',tag),('templates',template)]: api.delete_resource(kind,item['id'])
for path,status in [('/redirect-probe',302),('/limited-probe',429)]:
    try: api.request('GET',path); raise AssertionError('Expected API error')
    except RedirectApiError as error:
        assert error.status==status
        if status==429: assert error.retry_after=='17'
try: RedirectsClient('token','http://example.com/api'); raise AssertionError('Insecure base accepted')
except ValueError: pass
account=RedirectsClient(os.environ['REDIRECT_TEST_SESSION'],os.environ['REDIRECT_TEST_BASE'],workspace_id=os.environ['REDIRECT_TEST_WORKSPACE'])
assert account.get_session()['workspace']['id']==os.environ['REDIRECT_TEST_WORKSPACE']
assert account.list_workspaces()['currentWorkspaceId']==os.environ['REDIRECT_TEST_WORKSPACE']
integration_input={'requestId':str(uuid.uuid4()),'provider':'gtm','name':'Python integration setup','linkIds':[os.environ['REDIRECT_TEST_REPORT_LINK']],'expiresAt':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()}
integration_setup=account.create_integration_setup(integration_input)
assert integration_setup['created'] and integration_setup['credential'].startswith('qg_redirect_')
assert account.create_integration_setup(integration_input)['credential'] is None
assert account.lookup_integration_setup(integration_input['requestId'])['installation']['id']==integration_setup['installation']['id']
assert account.lookup_integration_setup(str(uuid.uuid4()))['installation'] is None
assert any(row['id']==integration_setup['installation']['id'] for row in account.list_integration_setups()['data'])
assert account.revoke_integration_setup(integration_setup['installation']['id'])['status']=='revoked'
try: api.list_integration_setups(); raise AssertionError('Key read account integration setups')
except RedirectApiError as error: assert error.status==403
for kind in ['domains','tokens','webhooks']: assert isinstance(account.list_workspace_information(kind,1)['data'],list)
try: api.list_workspace_information('tokens'); raise AssertionError('Key read account metadata')
except RedirectApiError as error: assert error.status==403
try:
    RedirectsClient(os.environ['REDIRECT_TEST_TOKEN'],os.environ['REDIRECT_TEST_BASE'],workspace_id='00000000-0000-4000-8000-000000000777').list_links()
    raise AssertionError('Unavailable workspace accepted')
except RedirectApiError as error: assert error.status==403
try:
    RedirectsClient('fixture',workspace_id='bad\r\nInjected: header')
    raise AssertionError('Invalid workspace accepted')
except ValueError: pass
other=RedirectsClient(os.environ['REDIRECT_TEST_OTHER_SESSION'],os.environ['REDIRECT_TEST_BASE'])
def report_error(action,status):
    try: action(); raise AssertionError('Expected report error')
    except RedirectApiError as error: assert error.status==status
report_error(lambda:api.list_reports(),403)
report=account.create_report({'name':'SDK Python report','filters':{'linkIds':[os.environ['REDIRECT_TEST_REPORT_LINK']]}})
second=account.create_report({'name':'SDK Python second','filters':{'linkIds':[os.environ['REDIRECT_TEST_REPORT_LINK']]}})
assert account.get_report(report['id'])['name']==report['name']
page=account.list_reports(limit=1); assert len(page['data'])==1 and page['nextCursor']
assert len(account.list_reports(limit=1,cursor=page['nextCursor'])['data'])==1
report_error(lambda:other.get_report(report['id']),404); assert other.list_reports()['count']==0
report=account.update_report(report['id'],{'version':report['version'],'visibility':'team'})
assert other.list_reports(view='team')['data'][0]['canEdit'] is False
report_error(lambda:other.update_report(report['id'],{'version':report['version'],'name':'Denied team edit'}),404)
report=account.update_report(report['id'],{'version':report['version'],'visibility':'private'})
assert other.list_reports(view='team')['count']==0
old_version=report['version']; report=account.update_report(report['id'],{'version':old_version,'name':'Reviewed Python report'})
report_error(lambda:account.update_report(report['id'],{'version':old_version,'name':'Stale'}),409)
aggregate=account.run_report(report['id']); assert aggregate['totals']['clicks']==1 and isinstance(aggregate['revenue'][0]['amount'],str)
share=account.create_report_share(report['id'],{'title':'Python shared','reportVersion':report['version'],'expiresAt':None})
assert account.list_report_shares(report['id'])['data'][0]['id']==share['id']
reader=RedirectsClient('qg_report_'+share['id'],os.environ['REDIRECT_TEST_BASE'])
assert reader.read_public_report()['report']['totals']['clicks']==1
assert reader.read_public_report({'dates':{'start':'2020-01-01T00:00:00Z','end':'2020-01-02T00:00:00Z'}})['report']['totals']['clicks']==0
assert account.revoke_report_share(report['id'],share['id'])['revoked']; report_error(lambda:reader.read_public_report(),404)
guarded=account.create_report_share(report['id'],{'title':'Python protected','reportVersion':report['version'],'password':'sdk-report-password','includeConversions':True,'expiresAt':None})
protected=RedirectsClient('qg_report_'+guarded['id'],os.environ['REDIRECT_TEST_BASE'])
report_error(lambda:protected.read_public_report(),401)
assert isinstance(protected.read_public_report({'password':'sdk-report-password'})['report']['revenue'][0]['amount'],str)
assert account.delete_report(report['id'])['deleted']; report_error(lambda:protected.read_public_report({'password':'sdk-report-password'}),404)
account.delete_report(second['id'])

customer=api.get_customer(lead['customerExternalId']); assert customer['version'] is None and customer['canEdit']
customer=api.update_customer(lead['customerExternalId'],{'version':None,'name':'SDK Python identity','email':'python@example.com','avatarUrl':'https://example.com/avatar.png'})
assert api.get_customer(lead['customerExternalId'])['name']=='SDK Python identity'
report_error(lambda:api.update_customer(lead['customerExternalId'],{'version':None,'name':'Stale identity'}),409)
page=api.customer_journey(lead['customerExternalId'],limit=1); assert len(page['data'])==1 and page['nextCursor']
assert len(api.customer_journey(lead['customerExternalId'],limit=1,cursor=page['nextCursor'])['data'])==1
identity_version=customer['version'];customer=api.clear_customer(lead['customerExternalId'],identity_version)
assert customer['name'] is None and customer['email'] is None and customer['avatarUrl'] is None and customer['version']!=identity_version
assert len(api.customer_journey(lead['customerExternalId'])['data'])==3

webhook=account.create_webhook({'name':'Python receiver','url':'https://receiver.example.org/events'});assert webhook['secret'].startswith('whsec_')
assert 'secret' not in account.get_webhook(webhook['id']);assert any(row['id']==webhook['id'] for row in account.list_webhooks()['data'])
webhook=account.update_webhook(webhook['id'],{'version':webhook['version'],'name':'Python updated'})
webhook=account.rotate_webhook_secret(webhook['id'],webhook['version']);assert webhook['previousKeyExpiresAt']
queued=account.test_webhook(webhook['id'],webhook['version']);assert queued['queued']
delivery=account.get_webhook_delivery(webhook['id'],queued['deliveryId']);assert json.loads(delivery['body'])['type']=='webhook.test'
assert account.list_webhook_deliveries(webhook['id'])['data'][0]['id']==delivery['id'];assert account.list_webhook_attempts(webhook['id'],delivery['id'])['data']==[]
webhook=account.archive_webhook(webhook['id'],webhook['version']);assert webhook['deletedAt']
webhook=account.update_webhook(webhook['id'],{'version':webhook['version'],'restore':True,'enabled':True})
delivery=account.get_webhook_delivery(webhook['id'],delivery['id']);assert account.replay_webhook_delivery(webhook['id'],delivery['id'],delivery['version'])['state']=='queued'
account.archive_webhook(webhook['id'],webhook['version'])

with open(os.path.join(os.path.dirname(__file__),'webhook-fixture.json')) as file: fixture=json.load(file)
args=(fixture['id'],fixture['timestamp'],fixture['signature'])
assert verify_webhook(fixture['secret'],fixture['body'],*args,now=1700000000)
assert not verify_webhook(fixture['secret'],fixture['body']+' ',*args,now=1700000000)
assert not verify_webhook(fixture['secret'],fixture['body'],*args,now=1700000301)
assert verify_webhook(fixture['secret'],fixture['body'],fixture['id'],fixture['timestamp'],'v1,'+'A'*43+'= '+fixture['signature'],now=1700000000)
