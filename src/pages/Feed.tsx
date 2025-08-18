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

export default function Feed() {
  const { user } = useAuth();
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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <div className="text-center space-y-4">
            <div className="h-8 bg-muted rounded w-1/3 mx-auto animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-2/3 mx-auto animate-pulse"></div>
          </div>
          
          <Card>
            <CardContent className="p-4">
              <div className="h-12 bg-muted rounded animate-pulse"></div>
            </CardContent>
          </Card>
          
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-muted rounded-full"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-24"></div>
                    <div className="h-3 bg-muted rounded w-32"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Users className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">Feed</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Stay connected with the latest posts, stories, and conversations from the LGBTQ+ community. 
          Share your thoughts and discover what's happening around you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 text-primary mx-auto mb-2" />
            <div className="text-2xl font-bold">{posts.length}</div>
            <div className="text-sm text-muted-foreground">Active Posts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Heart className="h-6 w-6 text-red-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">
              {posts.reduce((sum, post) => sum + (post.likes_count || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">Total Likes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageCircle className="h-6 w-6 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">
              {posts.reduce((sum, post) => sum + (post.comments_count || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">Comments</div>
          </CardContent>
        </Card>
      </div>

      {user && (
        <Card className="mb-8">
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
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search posts or users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="recent" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Recent
          </TabsTrigger>
          <TabsTrigger value="popular" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Popular
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-6">
        {sortedPosts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">
                {searchTerm ? 'No posts found' : 'No posts yet'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {searchTerm 
                  ? 'Try adjusting your search terms to find what you\'re looking for.'
                  : 'Be the first to share something with the community!'
                }
              </p>
              {!searchTerm && user && (
                <CreatePostDialog>
                  <Button>
                    <PenSquare className="h-4 w-4 mr-2" />
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
      </div>

      {!user && (
        <Card className="mt-8 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-8 text-center">
            <Heart className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">Join the Feed</h3>
            <p className="text-muted-foreground mb-6">
              Sign up to share your thoughts, connect with others, and be part of our growing community.
            </p>
            <Button asChild>
              <a href="/auth">Join Now</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}