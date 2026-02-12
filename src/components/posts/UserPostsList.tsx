import { PostCard } from './PostCard';
import { CreatePostDialog } from './CreatePostDialog';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PenSquare, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface UserPostsListProps {
  userId: string;
  isOwnProfile: boolean;
}

export const UserPostsList = ({ userId, isOwnProfile }: UserPostsListProps) => {
  const { user } = useAuth();
  const {
    posts,
    isLoading,
    likePost,
    unlikePost,
    deletePost,
    isLikingPost,
    isDeletingPost
  } = useCommunityPosts(userId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ height: 40, width: 40, bgcolor: 'action.hover', borderRadius: '50%' }}></Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: 96 }}></Box>
                  <Box sx={{ height: 12, bgcolor: 'action.hover', borderRadius: 1, width: 128 }}></Box>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '100%' }}></Box>
                <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '75%' }}></Box>
                <Box sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '50%' }}></Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  if (!posts.length) {
    return (
      <Card>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Users style={{ width: 48, height: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1 }}>
            {isOwnProfile ? "You haven't posted anything yet" : "No posts yet"}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {isOwnProfile
              ? "Share your thoughts, experiences, or ask questions with the community."
              : "This user hasn't shared any posts yet."
            }
          </Typography>
          {isOwnProfile && user && (
            <CreatePostDialog>
              <Button>
                <PenSquare style={{ width: 16, height: 16, marginRight: 8 }} />
                Create Your First Post
              </Button>
            </CreatePostDialog>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Create Post Button for Own Profile */}
      {isOwnProfile && user && (
        <Card>
          <CardContent sx={{ p: 2 }}>
            <CreatePostDialog>
              <Button variant="outline" sx={{ width: '100%', justifyContent: 'flex-start', height: 48 }}>
                <PenSquare style={{ width: 16, height: 16, marginRight: 8 }} />
                What's on your mind?
              </Button>
            </CreatePostDialog>
          </CardContent>
        </Card>
      )}

      {/* Posts List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onLike={likePost}
            onUnlike={unlikePost}
            onDelete={deletePost}
            isLiking={isLikingPost || isDeletingPost}
          />
        ))}
      </Box>
    </Box>
  );
};