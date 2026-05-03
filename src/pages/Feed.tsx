import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Users,
  PenSquare,
  Search,
  Heart,
  MessageCircle
} from 'lucide-react';
import { PostCard } from '@/components/posts/PostCard';
import { CreatePostDialog } from '@/components/posts/CreatePostDialog';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';

export default function Feed() {
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('recent');

  const {
    posts,
    isLoading,
    likePost,
    unlikePost,
    deletePost,
    isLikingPost,
    isDeletingPost
  } = useCommunityPosts();

  const filteredPosts = posts.filter(post =>
    post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    post.profiles?.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (activeTab === 'popular') {
      return (b.likes_count || 0) - (a.likes_count || 0);
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <AuthGate
      title="Feed"
      description="Sign in to share posts, connect with the community, and discover what's happening around you."
    >
      <div className="container mx-auto py-8 px-4">
        <PageHeader
          title="Feed"
          subtitle="Stay connected with the latest posts, stories, and conversations from the LGBTQ+ community. Share your thoughts and discover what's happening around you."
          center
        />

        {isLoading ? (
          <PageLoadingState count={3} variant="list" />
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="h-6 w-6 mx-auto mb-2" />
                  <h5 className="text-2xl font-bold">{posts.length}</h5>
                  <p className="text-sm text-muted-foreground">{t('pages.feed.activePosts', 'Active Posts')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Heart className="h-6 w-6 mx-auto mb-2" style={{ color: 'hsl(var(--brand))' }} />
                  <h5 className="text-2xl font-bold">
                    {posts.reduce((sum, post) => sum + (post.likes_count || 0), 0)}
                  </h5>
                  <p className="text-sm text-muted-foreground">{t('pages.feed.totalLikes', 'Total Likes')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <MessageCircle className="h-6 w-6 mx-auto mb-2 text-foreground" />
                  <h5 className="text-2xl font-bold">
                    {posts.reduce((sum, post) => sum + (post.comments_count || 0), 0)}
                  </h5>
                  <p className="text-sm text-muted-foreground">{t('pages.feed.comments', 'Comments')}</p>
                </CardContent>
              </Card>
            </div>

            {/* Create Post */}
            <Card>
              <CardContent className="p-4">
                <CreatePostDialog>
                  <Button variant="outline" className="w-full justify-start h-14 text-left">
                    <PenSquare className="h-5 w-5 mr-3 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      What's on your mind? Share with the community...
                    </span>
                  </Button>
                </CreatePostDialog>
              </CardContent>
            </Card>

            {/* Search & Tabs */}
            <div className="p-4 mb-6 bg-background border border-border rounded">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('pages.feed.searchPlaceholder', 'Search posts or users...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="recent">
                    Recent
                  </TabsTrigger>
                  <TabsTrigger value="popular">
                    Popular
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Posts */}
            <div className="flex flex-col gap-6">
              {sortedPosts.length === 0 ? (
                searchTerm ? (
                  <EmptyState
                    icon={Search}
                    title={t('pages.feed.emptyTitle', 'Your feed is fresh')}
                    description={t('pages.feed.emptyDescription', 'Follow people and groups to see their posts here.')}
                    mood="encouraging"
                  />
                ) : (
                  <EmptyState
                    icon={Users}
                    title="Your feed is fresh"
                    description="Follow people and groups to see their posts here."
                    mood="encouraging"
                  >
                    <CreatePostDialog>
                      <Button>
                        <PenSquare className="h-4 w-4 mr-2" />
                        Create First Post
                      </Button>
                    </CreatePostDialog>
                  </EmptyState>
                )
              ) : (
                sortedPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={likePost}
                    onUnlike={unlikePost}
                    onDelete={deletePost}
                    isLiking={isLikingPost || isDeletingPost}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </AuthGate>
  );
}
