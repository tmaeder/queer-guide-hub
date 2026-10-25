import os,sys
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'../python'))
from redirects import RedirectsClient
client=RedirectsClient(os.environ['REDIRECT_TEST_SESSION'],os.environ['REDIRECT_TEST_BASE'],workspace_id=os.environ['REDIRECT_OWNER_WORKSPACE'])
assert client.list_workspace_owners()['workspace']['id']==os.environ['REDIRECT_OWNER_WORKSPACE']
assert any(row['memberId']==os.environ['REDIRECT_OWNER_MEMBER'] for row in client.list_owner_candidates()['data'])
grant=client.admit_workspace_owner(os.environ['REDIRECT_OWNER_MEMBER'],'viewer')
assert grant['userId']==os.environ['REDIRECT_OWNER_USER'] and grant['version'] and grant['canRemove']
assert client.remove_workspace_owner(grant['userId'],grant['version'])['removed']
