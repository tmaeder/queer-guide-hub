<?php
require_once __DIR__.'/../php/RedirectsClient.php';
$client=new QueerGuide\RedirectsClient(getenv('REDIRECT_TEST_SESSION'),getenv('REDIRECT_TEST_BASE'),workspaceId:getenv('REDIRECT_OWNER_WORKSPACE'));
if($client->listWorkspaceOwners()['workspace']['id']!==getenv('REDIRECT_OWNER_WORKSPACE'))throw new RuntimeException('Wrong registry workspace');
if(!in_array(getenv('REDIRECT_OWNER_MEMBER'),array_column($client->listOwnerCandidates()['data'],'memberId'),true))throw new RuntimeException('Missing candidate');
$grant=$client->admitWorkspaceOwner(getenv('REDIRECT_OWNER_MEMBER'),'viewer');
if($grant['userId']!==getenv('REDIRECT_OWNER_USER')||!$grant['version']||!$grant['canRemove'])throw new RuntimeException('Wrong Owner admission');
if(!$client->removeWorkspaceOwner($grant['userId'],$grant['version'])['removed'])throw new RuntimeException('Owner removal failed');
