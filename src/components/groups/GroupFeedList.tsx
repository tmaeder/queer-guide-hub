import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { UsersRound } from '@/components/icons';
import { useMyGroupsFeed } from '@/hooks/useGroupPosts';

/**
 * The Feed's Groups tab: newest posts from the member's own groups. Each one
 * opens in its group, where liking, voting and commenting already live.
 */
export function GroupFeedList({ searchTerm = '' }: { searchTerm?: string }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useMyGroupsFeed();
  const term = searchTerm.trim().toLowerCase();
  const posts = term
    ? data.filter(
        (p) =>
          p.content.toLowerCase().includes(term) ||
          p.author_name.toLowerCase().includes(term) ||
          p.group_name.toLowerCase().includes(term),
      )
    : data;

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  if (posts.length === 0) {
    return term ? (
      <EmptyState
        icon={UsersRound}
        title={t('pages.feed.searchEmptyTitle', 'No posts match your search')}
        description={t(
          'pages.feed.searchEmptyDescription',
          'Try a different keyword or clear the search to see everything.',
        )}
        mood="neutral"
      />
    ) : (
      <EmptyState
        icon={UsersRound}
        title={t('pages.feed.groupsEmptyTitle', 'No posts in your groups yet.')}
        description={t(
          'pages.feed.groupsEmptyDescription',
          'Posts from groups you join show up here.',
        )}
        mood="neutral"
      >
        <Button asChild variant="outline">
          <LocalizedLink to="/meet/groups">
            {t('pages.feed.findGroups', 'Find groups')}
          </LocalizedLink>
        </Button>
      </EmptyState>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {posts.map((post) => {
        const groupPath = `/meet/groups/${post.group_id}`;
        const when = new Date(post.created_at);
        return (
          <li key={post.id}>
            <Card>
              <CardContent className="flex flex-col gap-4 p-4">
                <div className="flex items-center gap-4">
                  <Avatar style={{ height: 40, width: 40 }}>
                    <AvatarImage src={post.author_avatar ?? undefined} />
                    <AvatarFallback>{post.author_name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{post.author_name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      <LocalizedLink to={groupPath}>{post.group_name}</LocalizedLink>
                      {!Number.isNaN(when.getTime()) &&
                        ` · ${formatDistanceToNow(when, { addSuffix: true })}`}
                    </p>
                  </div>
                </div>
                {post.content && (
                  <p className="line-clamp-4 whitespace-pre-line text-pretty">{post.content}</p>
                )}
                <Button asChild variant="soft" size="sm" className="self-start">
                  <LocalizedLink to={`${groupPath}?post=${post.id}`}>
                    {t('pages.feed.openInGroup', 'Open in group')}
                  </LocalizedLink>
                </Button>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
