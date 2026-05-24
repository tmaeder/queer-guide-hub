import { useMemo, useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Users,
  PenSquare,
  Search,
  Heart,
  MessageCircle,
  AlertTriangle,
  RefreshCw,
  Home,
  Loader2,
  LogIn,
} from 'lucide-react';
import { PostCard } from '@/components/posts/PostCard';
import { CreatePostDialog } from '@/components/posts/CreatePostDialog';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';

export default function Feed() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'popular'>('recent');

  const {
    posts,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    likePost,
    unlikePost,
    deletePost,
    isLikingPost,
    isDeletingPost,
  } = useCommunityPosts();

  const filteredPosts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter(
      (post) =>
        post.content?.toLowerCase().includes(term) ||
        post.profiles?.display_name?.toLowerCase().includes(term),
    );
  }, [posts, searchTerm]);

  const sortedPosts = useMemo(() => {
    if (activeTab === 'popular') {
      return [...filteredPosts].sort(
        (a, b) => (b.likes_count || 0) - (a.likes_count || 0),
      );
    }
    return filteredPosts;
  }, [filteredPosts, activeTab]);

  const totalLikes = useMemo(
    () => posts.reduce((sum, post) => sum + (post.likes_count || 0), 0),
    [posts],
  );
  const totalComments = useMemo(
    () => posts.reduce((sum, post) => sum + (post.comments_count || 0), 0),
    [posts],
  );

  return (
    <div className="container mx-auto py-8 px-4">
      <PageHeader
        title={t('pages.nav.feed', 'Feed')}
        subtitle={t(
          'pages.feed.subtitle',
          "Posts, stories, and conversations from the LGBTQ+ community. Share your thoughts and see what's happening around you.",
        )}
        center
      />

      {isLoading ? (
        <PageLoadingState count={3} variant="list" />
      ) : error ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="text-center flex flex-col gap-4 max-w-md">
            <AlertTriangle
              className="h-12 w-12 text-destructive mx-auto"
              aria-hidden="true"
            />
            <h6 className="text-base font-semibold">
              {t('pages.feed.errorTitle', "We couldn't load the feed")}
            </h6>
            <p className="text-sm text-muted-foreground">
              {t(
                'pages.feed.errorDescription',
                'Something went wrong while loading community posts. Check your connection and try again.',
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="outline"
                onClick={() => refetch()}
                className="inline-flex gap-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {t('common.tryAgain', 'Try Again')}
              </Button>
              <Button asChild className="inline-flex gap-2">
                <LocalizedLink to="/">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  {t('common.goHome', 'Go Home')}
                </LocalizedLink>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="h-6 w-6 mx-auto mb-2" />
                <h5 className="text-2xl font-bold">{posts.length}</h5>
                <p className="text-sm text-muted-foreground">
                  {t('pages.feed.activePosts', 'Active Posts')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Heart className="h-6 w-6 mx-auto mb-2 text-foreground" />
                <h5 className="text-2xl font-bold">{totalLikes}</h5>
                <p className="text-sm text-muted-foreground">
                  {t('pages.feed.totalLikes', 'Total Likes')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <MessageCircle className="h-6 w-6 mx-auto mb-2 text-foreground" />
                <h5 className="text-2xl font-bold">{totalComments}</h5>
                <p className="text-sm text-muted-foreground">
                  {t('pages.feed.comments', 'Comments')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Create Post / Sign-in CTA */}
          <Card className="mb-6">
            <CardContent className="p-4">
              {user ? (
                <CreatePostDialog>
                  <Button
                    variant="outline"
                    className="w-full justify-start h-14 text-left"
                  >
                    <PenSquare className="h-5 w-5 mr-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {t(
                        'pages.feed.createPostPlaceholder',
                        "What's on your mind? Share with the community...",
                      )}
                    </span>
                  </Button>
                </CreatePostDialog>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <p className="text-sm text-muted-foreground flex-1 text-center sm:text-left">
                    {t(
                      'pages.feed.signInToPost',
                      'Sign in to share posts, like, and comment.',
                    )}
                  </p>
                  <Button asChild className="inline-flex gap-2 shrink-0">
                    <LocalizedLink to="/auth">
                      <LogIn className="h-4 w-4" aria-hidden="true" />
                      {t('common.signIn', 'Sign in')}
                    </LocalizedLink>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search & Tabs */}
          <div className="p-4 mb-6 bg-background border border-border rounded">
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t(
                    'pages.feed.searchPlaceholder',
                    'Search posts or users...',
                  )}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  aria-label={t(
                    'pages.feed.searchPlaceholder',
                    'Search posts or users...',
                  )}
                />
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'recent' | 'popular')}
            >
              <TabsList>
                <TabsTrigger value="recent">
                  {t('pages.feed.recent', 'Recent')}
                </TabsTrigger>
                <TabsTrigger value="popular">
                  {t('pages.feed.popular', 'Popular')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Posts */}
          <div className="flex flex-col gap-6">
            {sortedPosts.length === 0 ? (
              searchTerm.trim() ? (
                <EmptyState
                  icon={Search}
                  title={t(
                    'pages.feed.searchEmptyTitle',
                    'No posts match your search',
                  )}
                  description={t(
                    'pages.feed.searchEmptyDescription',
                    'Try a different keyword or clear the search to see everything.',
                  )}
                  mood="neutral"
                  primaryAction={{
                    label: t('pages.feed.clearSearch', 'Clear search'),
                    onClick: () => setSearchTerm(''),
                    variant: 'outline',
                  }}
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title={t('pages.feed.emptyTitle', 'Your feed is fresh')}
                  description={t(
                    'pages.feed.emptyDescription',
                    'No posts yet. Be the first to share something with the community.',
                  )}
                  mood="encouraging"
                >
                  {user ? (
                    <CreatePostDialog>
                      <Button>
                        <PenSquare className="h-4 w-4 mr-2" />
                        {t('pages.feed.createFirstPost', 'Create First Post')}
                      </Button>
                    </CreatePostDialog>
                  ) : (
                    <Button asChild>
                      <LocalizedLink to="/auth">
                        <LogIn className="h-4 w-4 mr-2" />
                        {t('common.signIn', 'Sign in')}
                      </LocalizedLink>
                    </Button>
                  )}
                </EmptyState>
              )
            ) : (
              <>
                {sortedPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={likePost}
                    onUnlike={unlikePost}
                    onDelete={deletePost}
                    isLiking={isLikingPost || isDeletingPost}
                  />
                ))}

                {/* Load more — only shown when not actively filtering, since
                    search/sort are client-side over already-fetched pages. */}
                {hasNextPage && !searchTerm.trim() && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="inline-flex gap-2"
                    >
                      {isFetchingNextPage && (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {t('pages.feed.loadMore', 'Load more')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
