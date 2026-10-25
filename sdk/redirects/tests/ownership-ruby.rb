require_relative '../ruby/redirects'
client=QueerGuide::RedirectsClient.new(ENV.fetch('REDIRECT_TEST_SESSION'),base_url:ENV.fetch('REDIRECT_TEST_BASE'),workspace_id:ENV.fetch('REDIRECT_OWNER_WORKSPACE'))
raise 'Wrong registry workspace' unless client.list_workspace_owners['workspace']['id']==ENV.fetch('REDIRECT_OWNER_WORKSPACE')
raise 'Missing candidate' unless client.list_owner_candidates['data'].any?{|row|row['memberId']==ENV.fetch('REDIRECT_OWNER_MEMBER')}
grant=client.admit_workspace_owner(ENV.fetch('REDIRECT_OWNER_MEMBER'),'viewer')
raise 'Wrong Owner admission' unless grant['userId']==ENV.fetch('REDIRECT_OWNER_USER') && grant['version'] && grant['canRemove']
raise 'Owner removal failed' unless client.remove_workspace_owner(grant['userId'],grant['version'])['removed']
