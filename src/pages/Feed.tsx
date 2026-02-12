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
      <div sx={{ maxWidth: 896, mx: 'auto', px: 2, py: 4 }}>
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '33%', mx: 'auto', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
            <div sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '66%', mx: 'auto', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
          </div>
          
          <Card>
            <CardContent sx={{ p: 2 }}>
              <div sx={{ height: 48, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
            </CardContent>
          </Card>
          
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
              <CardContent sx={{ p: 3 }}>
                <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <div sx={{ height: 40, width: 40, bgcolor: 'action.hover', borderRadius: '50%' }}></div>
                  <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <div sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: 96 }}></div>
                    <div sx={{ height: 12, bgcolor: 'action.hover', borderRadius: 1, width: 128 }}></div>
                  </div>
                </div>
                <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '100%' }}></div>
                  <div sx={{ height: 16, bgcolor: 'action.hover', borderRadius: 1, width: '75%' }}></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div sx={{ maxWidth: 896, mx: 'auto', px: 2, py: 4 }}>
      <div sx={{ textAlign: 'center', mb: 4 }}>
        <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}>
          <Users style={{ height: 32, width: 32, color: 'var(--primary)' }} />
          <h1 sx={{ fontSize: '2.25rem', fontWeight: 700 }}>Feed</h1>
        </div>
        <p sx={{ fontSize: '1.125rem', color: 'text.secondary', maxWidth: 672, mx: 'auto' }}>
          Stay connected with the latest posts, stories, and conversations from the LGBTQ+ community. 
          Share your thoughts and discover what's happening around you.
        </p>
      </div>

      <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 4 }}>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Users style={{ height: 24, width: 24, color: 'var(--primary)', margin: '0 auto 8px' }} />
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{posts.length}</div>
            <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Active Posts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <Heart style={{ height: 24, width: 24, color: '#ef4444', margin: '0 auto 8px' }} />
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {posts.reduce((sum, post) => sum + (post.likes_count || 0), 0)}
            </div>
            <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Total Likes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2, textAlign: 'center' }}>
            <MessageCircle style={{ height: 24, width: 24, color: '#3b82f6', margin: '0 auto 8px' }} />
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {posts.reduce((sum, post) => sum + (post.comments_count || 0), 0)}
            </div>
            <div sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Comments</div>
          </CardContent>
        </Card>
      </div>

      {user && (
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ p: 2 }}>
            <CreatePostDialog>
              <Button variant="outline" sx={{ width: '100%', justifyContent: 'flex-start', height: 56, textAlign: 'left' }}>
                <PenSquare style={{ height: 20, width: 20, marginRight: 12, color: 'var(--muted-foreground)' }} />
                <span style={{ color: 'var(--muted-foreground)' }}>
                  What's on your mind? Share with the community...
                </span>
              </Button>
            </CreatePostDialog>
          </CardContent>
        </Card>
      )}

      <div sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
        <div sx={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          <Input
            placeholder="Search posts or users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ pl: 5 }}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} sx={{ mb: 3 }}>
        <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr' }}>
          <TabsTrigger value="recent" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MessageCircle style={{ height: 16, width: 16 }} />
            Recent
          </TabsTrigger>
          <TabsTrigger value="popular" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingUp style={{ height: 16, width: 16 }} />
            Popular
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {sortedPosts.length === 0 ? (
          <Card>
            <CardContent sx={{ p: 6, textAlign: 'center' }}>
              <Users style={{ height: 64, width: 64, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
              <h3 sx={{ fontSize: '1.25rem', fontWeight: 500, mb: 1 }}>
                {searchTerm ? 'No posts found' : 'No posts yet'}
              </h3>
              <p sx={{ color: 'text.secondary', mb: 3 }}>
                {searchTerm 
                  ? 'Try adjusting your search terms to find what you\'re looking for.'
                  : 'Be the first to share something with the community!'
                }
              </p>
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
      </div>

      {!user && (
        <Card sx={{ mt: 4, background: 'linear-gradient(to right, rgba(var(--primary-rgb), 0.1), rgba(var(--accent-rgb), 0.1))', borderColor: 'rgba(var(--primary-rgb), 0.2)' }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Heart style={{ height: 48, width: 48, color: 'var(--primary)', margin: '0 auto 16px' }} />
            <h3 sx={{ fontSize: '1.25rem', fontWeight: 500, mb: 1 }}>Join the Feed</h3>
            <p sx={{ color: 'text.secondary', mb: 3 }}>
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