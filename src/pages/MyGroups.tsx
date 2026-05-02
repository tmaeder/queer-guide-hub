import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GroupCard } from '@/components/groups/GroupCard';
import { CreateGroupDialog } from '@/components/groups/CreateGroupDialog';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/hooks/useAuth';
import { Users, Crown, UserCheck, Settings, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';

export default function MyGroups() {
  const { userGroups, isLoading, createGroup, isCreating, leaveGroup, isLeaving } = useGroups();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  const filteredAndSortedGroups = useMemo(() => {
    let filtered = userGroups;

    if (searchQuery) {
      filtered = filtered.filter(
        (group) =>
          group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          group.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'members':
          return b.member_count - a.member_count;
        case 'recent':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [userGroups, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const total = userGroups.length;
    const ownedGroups = userGroups.filter((group) => group.created_by === user?.id).length;
    const memberGroups = total - ownedGroups;
    const privateGroups = userGroups.filter((group) => group.is_private).length;

    return { total, ownedGroups, memberGroups, privateGroups };
  }, [userGroups, user?.id]);

  return (
    <AuthGate title={t('pages.myGroups.title', 'My Groups')} description="Please sign in to view your groups">
      <div className="container mx-auto py-8 px-4">
        <PageHeader
          title="My Groups"
          subtitle={t('pages.myGroups.subtitle', 'Manage and explore your community groups')}
          actions={
            <>
              <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
              <Button variant="outline" asChild>
                <LocalizedLink to="/groups">
                  <Users className="h-4 w-4 mr-2" />
                  Discover Groups
                </LocalizedLink>
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Total Groups
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="text-2xl font-bold">{stats.total}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Owned
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4" style={{ color: '#eab308' }} />
                <span className="text-2xl font-bold">{stats.ownedGroups}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Member Of
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" style={{ color: '#22c55e' }} />
                <span className="text-2xl font-bold">{stats.memberGroups}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Private
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" style={{ color: '#3b82f6' }} />
                <span className="text-2xl font-bold">{stats.privateGroups}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder={t('pages.myGroups.searchPlaceholder', 'Search your groups...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{t('pages.myGroups.mostRecent', 'Most Recent')}</SelectItem>
              <SelectItem value="name">{t('pages.myGroups.nameAZ', 'Name A-Z')}</SelectItem>
              <SelectItem value="members">{t('pages.myGroups.mostMembers', 'Most Members')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <PageLoadingState count={6} />
        ) : filteredAndSortedGroups.length === 0 ? (
          searchQuery ? (
            <EmptyState
              icon={Search}
              title={t('pages.myGroups.emptyTitle', "You haven't joined any groups yet")}
              description="Explore groups and find your people."
              mood="encouraging"
            />
          ) : (
            <Card>
              <CardContent>
                <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h6 className="text-base font-semibold mb-2">
                  You haven't joined any groups yet
                </h6>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Start by joining existing groups or create your own!
                </p>
                <div className="flex justify-center gap-3">
                  <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                  <Button variant="outline" asChild>
                    <LocalizedLink to="/groups">{t('pages.myGroups.browseGroups', 'Browse Groups')}</LocalizedLink>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedGroups.map((group) => (
              <GroupCard key={group.id} group={group} onLeave={leaveGroup} isLeaving={isLeaving} />
            ))}
          </div>
        )}
      </div>
    </AuthGate>
  );
}
