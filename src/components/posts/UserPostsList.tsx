import { PostCard } from './PostCard';
import { CreatePostDialog } from './CreatePostDialog';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PenSquare, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface UserPostsListProps {
  userId: string;
  isOwnProfile: boolean;
}

export const UserPostsList = ({ userId, isOwnProfile }: UserPostsListProps) => {
  const { user } = useAuth();
  const { posts, isLoading, likePost, unlikePost, deletePost, isLikingPost, isDeletingPost } =
    useCommunityPosts(userId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="h-10 w-10 bg-muted rounded-full"></div>
                <div className="flex flex-col gap-2">
                  <div className="h-4 bg-muted w-24"></div>
                  <div className="h-3 bg-muted w-32"></div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-4 bg-muted w-full"></div>
                <div className="h-4 bg-muted w-3/4"></div>
                <div className="h-4 bg-muted w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!posts.length) {
    return (
      <Card>
        <CardContent>
          <Users size={48} style={{ margin: '0 auto 16px' }} className="text-muted-foreground" />
          <h6 className="text-base font-medium mb-2">
            {isOwnProfile ? "You haven't posted anything yet" : 'No posts yet'}
          </h6>
          <p className="text-muted-foreground mb-4">
            {isOwnProfile
              ? 'Share your thoughts, experiences, or ask questions with the community.'
              : "This user hasn't shared any posts yet."}
          </p>
          {isOwnProfile && user && (
            <CreatePostDialog>
              <Button>
                <PenSquare size={16} className="mr-2" />
                Create Your First Post
              </Button>
            </CreatePostDialog>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create Post Button for Own Profile */}
      {isOwnProfile && user && (
        <Card>
          <CardContent>
            <CreatePostDialog>
              <Button variant="outline">
                <PenSquare size={16} className="mr-2" />
                What's on your mind?
              </Button>
            </CreatePostDialog>
          </CardContent>
        </Card>
      )}

      {/* Posts List */}
      <div className="flex flex-col gap-4">
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
      </div>
    </div>
  );
};
