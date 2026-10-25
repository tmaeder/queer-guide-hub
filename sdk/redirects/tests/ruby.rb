require 'securerandom'
require 'time'
require_relative '../ruby/redirects'
api=QueerGuide::RedirectsClient.new(ENV.fetch('REDIRECT_TEST_TOKEN'),base_url:ENV.fetch('REDIRECT_TEST_BASE'),workspace_id:ENV.fetch('REDIRECT_TEST_WORKSPACE'))
def check(value); raise 'Assertion failed' unless value; end
source_page=api.list_inventory({kind:'Client'},limit:1)
check(source_page['data'].length==1 && source_page['count']>0)
source_record=source_page['data'][0];source_metadata=api.get_inventory_metadata(source_record['id'])
organized_source=api.organize_inventory([{id:source_record['id'],version:source_metadata['metadataVersion'],values:{comment:'SDK source metadata'}}])
check(organized_source['data'][0]['comment']=='SDK source metadata' && organized_source['data'][0]['metadataVersion']!=source_metadata['metadataVersion'])
check(api.list_domain_choices['count']==1)
check(api.list_linked_domains['count']==0)
root=api.create_link({isDomainRoot:true,domainId:ENV.fetch('REDIRECT_TEST_ROOT_DOMAIN'),target:'https://example.org/home'})['link']
check(root['isDomainRoot'] && root['shortUrl']=='https://root-sdk.example.com/')
check(api.upsert_link({isDomainRoot:true,domainId:ENV.fetch('REDIRECT_TEST_ROOT_DOMAIN'),target:'https://example.org/updated'})['link']['id']==root['id'])
api.delete_link(root['id'])
folder=api.create_resource('folders',{name:'Héllo & + Ruby'});tag=api.create_resource('tags',{name:'Ruby tag',color:'pink'})
template=api.create_resource('templates',{name:'Ruby template',parameters:{utm_campaign:'Launch & +'}})
check(api.update_resource('folders',folder['id'],{description:'Changed'})['description']=='Changed')
check(api.update_resource('tags',tag['id'],{color:'blue'})['color']=='blue')
check(api.list_resources('templates')['data'].length==1)
check(api.get_resource('folders',folder['id'])['name']=='Héllo & + Ruby')
created=api.create_link({target:'https://example.com/?q=a%26b#detail',slug:'sdk-ruby',startsAt:'2020-01-01T00:00:00Z',clickLimit:25,notes:'SDK notes',folderId:folder['id'],tagIds:[tag['id']]});id=created['link']['id']
check(api.get_qr_style(id)['style']['foreground']=='#111111');check(created['link']['clickLimit']==25 && created['link']['notes']=='SDK notes' && created['link']['startsAt'])
qr_image=api.create_qr_image({linkId:id,logo:ENV.fetch('REDIRECT_TEST_QR_LOGO')})
check(qr_image['state']=='published' && qr_image['logoMode']=='custom' && qr_image['logoAsset']['url'])
check(qr_image['imageUrls']['png'].start_with?('https://queer.guide/api/qr?share=qg_qr_'))
check(api.list_qr_images['data'].any?{|row|row['id']==qr_image['id']})
check(api.revoke_qr_image(qr_image['id'],qr_image['version'])['revokedAt'])
art=api.upload_preview_image(id,ENV.fetch('REDIRECT_TEST_IMAGE'));api.update_presentation(id,{preview:{title:'SDK preview',image:art['image'],video:'https://example.com/a.mp4'},cloaked:true});check(api.get_presentation(id)['preview']['title']=='SDK preview')
api.update_policy(id,{policy:{track_conversions:true,geo_targets:{CH:'/switzerland'}},password:'fixture-sdk-password'})
policy=api.get_policy(id);check(policy['hasPassword']==true);check(policy['policy']['preview']['title']=='SDK preview');check(!policy.to_s.include?('password_hash'));check(!policy.to_s.include?('fixture-sdk-password'))
api.update_policy(id,{policy:{geo_targets:nil},password:nil});policy=api.get_policy(id);check(policy['hasPassword']==false);check(policy['policy']['track_conversions']==true);check(!policy['policy'].key?('geo_targets'))
api.update_link(id,{comment:'SDK update',isEnabled:false});check(api.get_link(id)['folderId']==folder['id'])
check(api.upsert_link({slug:'sdk-ruby',target:'/updated'})['created']==false)
check(api.count_links({ids:[id]})['count']==1)
check(api.iterate_links({search:'sdk-page-'}).to_a.length==101)
batch=api.bulk([{operation:'update',id:id,data:{comment:'Batch'}},{operation:'create',data:{target:'/events'}}]);api.delete_link(batch['data'][1]['link']['id'])
lead={clickId:ENV.fetch('REDIRECT_TEST_CLICK'),customerExternalId:'sdk:ruby/customer & ü',eventId:'sdk-lead:ruby'}
api.track_lead(lead);check(api.track_lead(lead)['duplicate']==true)
api.track_sale(lead.merge(eventId:'sdk-sale:ruby',amount:'49.900001',currency:'CHF'))
check(api.analytics({country:'CH'})['totals']);check(!api.events({},limit:1)['data'].empty?)

branding=api.get_password_branding(id);check(branding['version'].nil?)
branding=api.update_password_branding(id,{version:nil,brandName:'Ruby public brand'})
branding=api.upload_password_logo(id,branding['version'],ENV['REDIRECT_TEST_QR_LOGO']);check(branding['logoAsset']['mime']=='image/png'&&branding['brandName']=='Ruby public brand')
check(api.update_password_branding(id,{version:branding['version'],clearLogo:true})['logoAsset'].nil?)
api.delete_link(id);[['folders',folder],['tags',tag],['templates',template]].each {|kind,item|api.delete_resource(kind,item['id'])}
[['/redirect-probe',302],['/limited-probe',429]].each do |path,status|
 begin;api.request('GET',path);raise 'Expected API error'
 rescue QueerGuide::RedirectApiError => error;check(error.status==status);check(error.retry_after=='17') if status==429;end
end
begin;QueerGuide::RedirectsClient.new('token',base_url:'http://example.com/api');raise 'Insecure base accepted';rescue ArgumentError;end
account=QueerGuide::RedirectsClient.new(ENV.fetch('REDIRECT_TEST_SESSION'),base_url:ENV.fetch('REDIRECT_TEST_BASE'),workspace_id:ENV.fetch('REDIRECT_TEST_WORKSPACE'))
check(account.get_session['workspace']['id']==ENV.fetch('REDIRECT_TEST_WORKSPACE'))
check(account.list_workspaces['currentWorkspaceId']==ENV.fetch('REDIRECT_TEST_WORKSPACE'))
check(account.list_workspaces(100)['data']==[])
integration_input={requestId:SecureRandom.uuid,provider:'segment',name:'Ruby integration setup',linkIds:[ENV.fetch('REDIRECT_TEST_REPORT_LINK')],expiresAt:(Time.now.utc+86400).iso8601}
integration_setup=account.create_integration_setup(integration_input)
check(integration_setup['created'] && integration_setup['credential'].start_with?('qg_redirect_'))
check(account.create_integration_setup(integration_input)['credential'].nil?)
check(account.lookup_integration_setup(integration_input[:requestId])['installation']['id']==integration_setup['installation']['id'])
check(account.lookup_integration_setup(SecureRandom.uuid)['installation'].nil?)
check(account.list_integration_setups['data'].any?{|row|row['id']==integration_setup['installation']['id']})
check(account.revoke_integration_setup(integration_setup['installation']['id'])['status']=='revoked')
begin; api.list_integration_setups; raise 'Key read account integration setups'; rescue QueerGuide::RedirectApiError => error; check(error.status==403); end
['domains','tokens','webhooks'].each {|kind|check(account.list_workspace_information(kind,1)['data'].is_a?(Array))}
begin;api.list_workspace_information('tokens');raise 'Key read account metadata';rescue QueerGuide::RedirectApiError=>error;check(error.status==403);end
begin
  QueerGuide::RedirectsClient.new(ENV.fetch('REDIRECT_TEST_TOKEN'),base_url:ENV.fetch('REDIRECT_TEST_BASE'),workspace_id:'00000000-0000-4000-8000-000000000777').list_links
  raise 'Unavailable workspace accepted'
rescue QueerGuide::RedirectApiError=>error; check(error.status==403); end
begin
  QueerGuide::RedirectsClient.new('fixture',workspace_id:"bad\r\nInjected: header")
  raise 'Invalid workspace accepted'
rescue ArgumentError; end
other=QueerGuide::RedirectsClient.new(ENV.fetch('REDIRECT_TEST_OTHER_SESSION'),base_url:ENV.fetch('REDIRECT_TEST_BASE'))
def report_error(status);begin;yield;raise 'Expected report error';rescue QueerGuide::RedirectApiError=>error;check(error.status==status);end;end
report_error(403){api.list_reports}
report=account.create_report({name:'SDK Ruby report',filters:{linkIds:[ENV.fetch('REDIRECT_TEST_REPORT_LINK')]}})
second=account.create_report({name:'SDK Ruby second',filters:{linkIds:[ENV.fetch('REDIRECT_TEST_REPORT_LINK')]}})
check(account.get_report(report['id'])['name']==report['name'])
page=account.list_reports(limit:1);check(page['data'].length==1&&page['nextCursor']);check(account.list_reports(limit:1,cursor:page['nextCursor'])['data'].length==1)
report_error(404){other.get_report(report['id'])};check(other.list_reports['count']==0)
report=account.update_report(report['id'],{version:report['version'],visibility:'team'})
check(other.list_reports(view:'team')['data'][0]['canEdit']==false)
report_error(404){other.update_report(report['id'],{version:report['version'],name:'Denied team edit'})}
report=account.update_report(report['id'],{version:report['version'],visibility:'private'})
check(other.list_reports(view:'team')['count']==0)
old_version=report['version'];report=account.update_report(report['id'],{version:old_version,name:'Reviewed Ruby report'})
report_error(409){account.update_report(report['id'],{version:old_version,name:'Stale'})}
aggregate=account.run_report(report['id']);check(aggregate['totals']['clicks']==1&&aggregate['revenue'][0]['amount'].is_a?(String))
share=account.create_report_share(report['id'],{title:'Ruby shared',reportVersion:report['version'],expiresAt:nil})
check(account.list_report_shares(report['id'])['data'][0]['id']==share['id'])
reader=QueerGuide::RedirectsClient.new('qg_report_'+share['id'],base_url:ENV.fetch('REDIRECT_TEST_BASE'))
check(reader.read_public_report['report']['totals']['clicks']==1)
check(reader.read_public_report({dates:{start:'2020-01-01T00:00:00Z',end:'2020-01-02T00:00:00Z'}})['report']['totals']['clicks']==0)
check(account.revoke_report_share(report['id'],share['id'])['revoked']);report_error(404){reader.read_public_report}
guarded=account.create_report_share(report['id'],{title:'Ruby protected',reportVersion:report['version'],password:'sdk-report-password',includeConversions:true,expiresAt:nil})
protected=QueerGuide::RedirectsClient.new('qg_report_'+guarded['id'],base_url:ENV.fetch('REDIRECT_TEST_BASE'))
report_error(401){protected.read_public_report}
check(protected.read_public_report({password:'sdk-report-password'})['report']['revenue'][0]['amount'].is_a?(String))
check(account.delete_report(report['id'])['deleted']);report_error(404){protected.read_public_report({password:'sdk-report-password'})}
account.delete_report(second['id'])

customer=api.get_customer(lead[:customerExternalId]);check(customer['version'].nil?&&customer['canEdit'])
customer=api.update_customer(lead[:customerExternalId],{version:nil,name:'SDK Ruby identity',email:'ruby@example.com',avatarUrl:'https://example.com/avatar.png'})
check(api.get_customer(lead[:customerExternalId])['name']=='SDK Ruby identity')
report_error(409){api.update_customer(lead[:customerExternalId],{version:nil,name:'Stale identity'})}
page=api.customer_journey(lead[:customerExternalId],limit:1);check(page['data'].length==1&&page['nextCursor']);check(api.customer_journey(lead[:customerExternalId],limit:1,cursor:page['nextCursor'])['data'].length==1)
identity_version=customer['version'];customer=api.clear_customer(lead[:customerExternalId],identity_version)
check(customer['name'].nil?&&customer['email'].nil?&&customer['avatarUrl'].nil?&&customer['version']!=identity_version)
check(api.customer_journey(lead[:customerExternalId])['data'].length==3)

webhook=account.create_webhook({name:'Ruby receiver',url:'https://receiver.example.org/events'});check(webhook['secret'].start_with?('whsec_'))
check(!account.get_webhook(webhook['id']).key?('secret'));check(account.list_webhooks()['data'].any?{|row|row['id']==webhook['id']})
webhook=account.update_webhook(webhook['id'],{version:webhook['version'],name:'Ruby updated'})
webhook=account.rotate_webhook_secret(webhook['id'],webhook['version']);check(webhook['previousKeyExpiresAt'])
queued=account.test_webhook(webhook['id'],webhook['version']);check(queued['queued'])
delivery=account.get_webhook_delivery(webhook['id'],queued['deliveryId']);check(JSON.parse(delivery['body'])['type']=='webhook.test')
check(account.list_webhook_deliveries(webhook['id'])['data'][0]['id']==delivery['id']);check(account.list_webhook_attempts(webhook['id'],delivery['id'])['data']==[])
webhook=account.archive_webhook(webhook['id'],webhook['version']);check(webhook['deletedAt'])
webhook=account.update_webhook(webhook['id'],{version:webhook['version'],restore:true,enabled:true})
delivery=account.get_webhook_delivery(webhook['id'],delivery['id']);check(account.replay_webhook_delivery(webhook['id'],delivery['id'],delivery['version'])['state']=='queued')
account.archive_webhook(webhook['id'],webhook['version'])

fixture=JSON.parse(File.read(File.join(__dir__,'webhook-fixture.json')))
args=[fixture['secret'],fixture['body'],fixture['id'],fixture['timestamp'],fixture['signature']]
check(QueerGuide.verify_webhook(*args,now:1700000000))
check(!QueerGuide.verify_webhook(fixture['secret'],fixture['body']+' ',fixture['id'],fixture['timestamp'],fixture['signature'],now:1700000000))
check(!QueerGuide.verify_webhook(*args,now:1700000301))
check(QueerGuide.verify_webhook(fixture['secret'],fixture['body'],fixture['id'],fixture['timestamp'],'v1,'+'A'*43+'= '+fixture['signature'],now:1700000000))
