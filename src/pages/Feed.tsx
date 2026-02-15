import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Users,
  TrendingUp,
  PenSquare,
  Search,
  Heart,
  MessageCircle
} from 'lucide-react';
import { PostCard } from '@/components/posts/PostCard';
import { CreatePostDialog } from '@/components/posts/CreatePostDialog';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Skeleton from '@mui/material/Skeleton';

export default function Feed() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Skeleton variant="rounded" width="33%" height={32} sx={{ mx: 'auto' }} />
            <Skeleton variant="rounded" width="66%" height={16} sx={{ mx: 'auto' }} />
          </Box>

          <Card>
            <CardContent style={{ padding: 16 }}>
              <Skeleton variant="rounded" height={48} />
            </CardContent>
          </Card>

          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent style={{ padding: 24 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Skeleton variant="rounded" width={96} height={16} />
                    <Skeleton variant="rounded" width={128} height={12} />
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Skeleton variant="rounded" width="100%" height={16} />
                  <Skeleton variant="rounded" width="75%" height={16} />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Header */}
      <Card sx={{ mb: 4 }}>
        <CardContent style={{ padding: '24px 32px', textAlign: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}>
            <Users style={{ height: 32, width: 32, color: '#333333' }} />
            <Typography variant="h3" sx={{ fontWeight: 700 }}>Feed</Typography>
          </Box>
          <Typography variant="subtitle1" color="text.secondary" sx={{ maxWidth: 672, mx: 'auto' }}>
            Stay connected with the latest posts, stories, and conversations from the LGBTQ+ community.
            Share your thoughts and discover what's happening around you.
          </Typography>
        </CardContent>
      </Card>

      {/* Auth gate for logged-out users */}
      {!user && (
        <Card sx={{ mt: 4 }}>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <Users style={{ width: 48, height: 48, margin: '0 auto 16px', color: '#999999' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Join the Conversation
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: '28rem', mx: 'auto' }}>
              Sign in to share posts, connect with the community, and discover what's happening around you.
            </Typography>
            <Button onClick={() => navigate('/auth')} style={{ paddingLeft: 24, paddingRight: 24 }}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {user && (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 4 }}>
        <Card>
          <CardContent style={{ padding: 16, textAlign: 'center' }}>
            <Users style={{ height: 24, width: 24, color: '#333333', margin: '0 auto 8px' }} />
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
      )}

      {/* Create Post */}
      {user && (
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
      )}

      {/* Search + Tabs + Posts (only for logged-in users) */}
      {user && (
      <>
      {/* Search */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
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

      {/* Tabs */}
      <Box sx={{ mb: 3 }}>
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
      </Box>

      {/* Posts */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {sortedPosts.length === 0 ? (
          <Card>
            <CardContent style={{ padding: 48, textAlign: 'center' }}>
              <Users style={{ height: 64, width: 64, color: '#999999', margin: '0 auto 16px' }} />
              <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>
                {searchTerm ? 'No posts found' : 'No posts yet'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {searchTerm
                  ? 'Try adjusting your search terms to find what you\'re looking for.'
                  : 'Be the first to share something with the community!'
                }
              </Typography>
              {!searchTerm && user && (
                <CreatePostDialog>
                  <Button>
                    <PenSquare style={{ height: 16, width: 16, marginRight: 8 }} />
                    Create First Post
                  </Button>
                </CreatePostDialog>
              )}
            </CardContent>
          </Card>
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
  );
}
