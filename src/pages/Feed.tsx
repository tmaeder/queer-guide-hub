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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Feed() {
  const [searchTerm, setSearchTerm] = useState('');
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
      <Container maxWidth="lg" sx={{ py: 4 }}>
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
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 4 }}>
              <Card>
                <CardContent style={{ padding: 16, textAlign: 'center' }}>
                  <Users style={{ height: 24, width: 24, margin: '0 auto 8px' }} />
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{posts.length}</Typography>
                  <Typography variant="body2" color="text.secondary">Active Posts</Typography>
                </CardContent>
              </Card>
              <Card>
                <CardContent style={{ padding: 16, textAlign: 'center' }}>
                  <Heart style={{ height: 24, width: 24, color: '#ef4444', margin: '0 auto 8px' }} />
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {posts.reduce((sum, post) => sum + (post.likes_count || 0), 0)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Total Likes</Typography>
                </CardContent>
              </Card>
              <Card>
                <CardContent style={{ padding: 16, textAlign: 'center' }}>
                  <MessageCircle style={{ height: 24, width: 24, color: '#3b82f6', margin: '0 auto 8px' }} />
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {posts.reduce((sum, post) => sum + (post.comments_count || 0), 0)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Comments</Typography>
                </CardContent>
              </Card>
            </Box>

            {/* Create Post */}
            <Card sx={{ mb: 4 }}>
              <CardContent style={{ padding: 16 }}>
                <CreatePostDialog>
                  <Button variant="outline" style={{ width: '100%', justifyContent: 'flex-start', height: 56, textAlign: 'left' }}>
                    <PenSquare style={{ height: 20, width: 20, marginRight: 12, color: '#999999' }} />
                    <span style={{ color: '#999999' }}>
                      What's on your mind? Share with the community...
                    </span>
                  </Button>
                </CreatePostDialog>
              </CardContent>
            </Card>

            {/* Search & Tabs */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'background.paper' }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 2 }}>
                <Box sx={{ position: 'relative', flex: 1 }}>
                  <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: '#999999' }} />
                  <Input
                    placeholder="Search posts or users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ paddingLeft: 40 }}
                  />
                </Box>
              </Box>

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
            </Paper>

            {/* Posts */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {sortedPosts.length === 0 ? (
                searchTerm ? (
                  <EmptyState
                    icon={Search}
                    title="No posts found"
                    description="Try adjusting your search terms to find what you're looking for."
                  />
                ) : (
                  <EmptyState
                    icon={Users}
                    title="No posts yet"
                    description="Be the first to share something with the community!"
                  >
                    <CreatePostDialog>
                      <Button>
                        <PenSquare style={{ height: 16, width: 16, marginRight: 8 }} />
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
            </Box>
          </>
        )}
      </Container>
    </AuthGate>
  );
}
