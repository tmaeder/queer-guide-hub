import { useState, useEffect } from 'react';
import { useCommunity } from '@/hooks/useCommunity';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Components
import { CreatePost } from '@/components/community/CreatePost';
import { PostCard } from '@/components/community/PostCard';
import { GroupCard } from '@/components/community/GroupCard';
import { CreateGroup } from '@/components/community/CreateGroup';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// Icons
import { 
  Users, 
  TrendingUp, 
  Clock, 
  Hash, 
  Search, 
  Filter,
  Loader,
  MessageSquare,
  Plus,
  AlertCircle,
  Heart,
  MessageCircle,
  Share2,
  Shield
} from 'lucide-react';

// Types
import { Database } from '@/integrations/supabase/types';
type CommunityPost = Database['public']['Tables']['community_posts']['Row'];

const Community = () => {
  // Hooks
  const { 
    posts, 
    loading: postsLoading, 
    error: postsError, 
    fetchPosts, 
    createPost, 
    toggleLike, 
    addComment 
  } = useCommunity();
  
  const { 
    groups, 
    myGroups, 
    loading: groupsLoading, 
    error: groupsError,
    refetch: refetchGroups 
  } = useGroups();
  
  const { user } = useAuth();
  
  // State
  const [activeTab, setActiveTab] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  
  // Popular tags
  const popularTags = [
    'community', 'support', 'events', 'pride', 'resources', 
    'questions', 'introductions', 'advice', 'local', 'activism'
  ];

  // Handlers
  const handleCreatePost = async (postData: any) => {
    if (!user) {
      toast.error('Please sign in to share posts with the community');
      return;
    }

    const { error } = await createPost({
      ...postData,
      user_id: user.id,
    });

    if (error) {
      toast.error('Failed to create post');
    } else {
      toast.success('Post shared successfully!');
      fetchPosts();
    }
  };

  const handleLike = async (postId: string) => {
    if (!user) {
      toast.error('Please sign in to like posts');
      return;
    }

    const { error } = await toggleLike(postId);
    if (error) {
      toast.error('Failed to update like');
    }
  };

  const handleComment = async (postId: string, content: string) => {
    if (!user) {
      toast.error('Please sign in to comment');
      return;
    }

    const { error } = await addComment(postId, content);
    if (error) {
      toast.error('Failed to add comment');
    } else {
      toast.success('Comment added!');
    }
  };

  const handleSearch = () => {
    fetchPosts({
      search: searchQuery || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
    });
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'recent') {
      fetchPosts();
    }
  };

  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
  };

  const clearFilters = () => {
    setSelectedTags([]);
    setSearchQuery('');
    fetchPosts();
  };

  // Error handling
  if (postsError && !posts.length) {
    return (
      <div className="min-h-screen bg-gradient-subtle animate-fade-in">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <CardContent>
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h3 className="text-xl font-semibold mb-2">Something went wrong</h3>
              <p className="text-muted-foreground mb-4">{postsError}</p>
              <Button onClick={() => fetchPosts()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle animate-fade-in">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-8 text-center lg:text-left">
          <h1 className="text-4xl font-bold gradient-text mb-2 animate-scale-in">
            Community Hub
          </h1>
          <p className="text-lg text-muted-foreground">
            Connect, share, and engage with the LGBTQ+ community
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <main className="lg:col-span-3 space-y-6">
            {/* Create Post */}
            {user && (
              <CreatePost 
                onPostCreate={handleCreatePost}
                loading={postsLoading}
              />
            )}

            {/* Search and Filters */}
            <Card className="p-4">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search posts and groups..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9"
                  />
                </div>
                <Button onClick={handleSearch} className="bg-gradient-primary">
                  Search
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className={showFilters ? 'bg-muted' : ''}
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>

              {showFilters && (
                <div className="space-y-3 pt-3 border-t animate-accordion-down">
                  <h4 className="text-sm font-medium">Filter by tags:</h4>
                  <div className="flex flex-wrap gap-2">
                    {popularTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={selectedTags.includes(tag) ? "default" : "outline"}
                        className="cursor-pointer hover:bg-primary/10 transition-colors hover-scale"
                        onClick={() => toggleTag(tag)}
                      >
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                  {(selectedTags.length > 0 || searchQuery) && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={clearFilters}
                    >
                      Clear all filters
                    </Button>
                  )}
                </div>
              )}
            </Card>

            {/* Content Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="recent" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Recent
                </TabsTrigger>
                <TabsTrigger value="trending" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Trending
                </TabsTrigger>
                <TabsTrigger value="following" className="gap-2" disabled={!user}>
                  <Heart className="h-4 w-4" />
                  Following
                </TabsTrigger>
                <TabsTrigger value="groups" className="gap-2">
                  <Users className="h-4 w-4" />
                  Groups
                </TabsTrigger>
              </TabsList>

              {/* Recent Posts Tab */}
              <TabsContent value="recent" className="mt-6 space-y-4">
                {postsLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Loading posts...</span>
                  </div>
                )}

                {!postsLoading && posts.length === 0 && (
                  <Card className="p-8 text-center">
                    <CardContent>
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-xl font-semibold mb-2">No posts yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Be the first to start a conversation in the community!
                      </p>
                      {user && (
                        <Button 
                          onClick={() => {
                            // Scroll to the top where the CreatePost component is
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="bg-gradient-primary"
                        >
                          Create First Post
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {!postsLoading && posts.length > 0 && (
                  <div className="space-y-4">
                    {posts.map((post, index) => (
                      <div key={post.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                        <PostCard
                          post={post}
                          onLike={handleLike}
                          onComment={handleComment}
                          currentUserId={user?.id}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Trending Tab */}
              <TabsContent value="trending" className="mt-6">
                <div className="text-center py-12">
                  <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Trending Posts</h3>
                  <p className="text-muted-foreground">
                    Most popular posts from the community
                  </p>
                </div>
              </TabsContent>

              {/* Following Tab */}
              <TabsContent value="following" className="mt-6">
                <div className="text-center py-12">
                  <Heart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Following Feed</h3>
                  <p className="text-muted-foreground">
                    Posts from people you follow will appear here
                  </p>
                </div>
              </TabsContent>

              {/* Groups Tab */}
              <TabsContent value="groups" className="mt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Community Groups</h2>
                    <p className="text-muted-foreground">Join groups to connect with like-minded people</p>
                  </div>
                  {user && (
                    <Button 
                      onClick={() => setIsCreateGroupOpen(true)}
                      className="bg-gradient-primary"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Group
                    </Button>
                  )}
                </div>

                {groupsError && (
                  <Card className="p-4 border-destructive">
                    <CardContent className="p-0">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">Failed to load groups</span>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={refetchGroups}
                          className="ml-auto"
                        >
                          Retry
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {user && myGroups.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">My Groups</h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {myGroups.map((group, index) => (
                        <div key={group.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                          <GroupCard group={group} showJoinButton={false} />
                        </div>
                      ))}
                    </div>
                    <Separator />
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">All Groups</h3>
                  {groupsLoading ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {[1, 2, 3].map((i) => (
                        <Card key={i} className="h-48 animate-pulse">
                          <CardContent className="p-6">
                            <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
                            <div className="h-8 bg-muted rounded w-full"></div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : groups.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {groups.map((group, index) => (
                        <div key={group.id} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                          <GroupCard group={group} />
                        </div>
                      ))}
                    </div>
                  ) : !groupsError && (
                    <div className="text-center py-12">
                      <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Groups Yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Be the first to create a community group
                      </p>
                      {user && (
                        <Button 
                          onClick={() => setIsCreateGroupOpen(true)}
                          className="bg-gradient-primary"
                        >
                          Create First Group
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </main>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Community Stats */}
            <Card className="hover-scale">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Community Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Posts</span>
                  <span className="font-medium">{posts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Groups</span>
                  <span className="font-medium">{groups.length}</span>
                </div>
                {user && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">My Groups</span>
                    <span className="font-medium">{myGroups.length}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trending Tags */}
            <Card className="hover-scale">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  Trending Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {popularTags.slice(0, 6).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 transition-colors hover-scale"
                      onClick={() => toggleTag(tag)}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Community Guidelines */}
            <Card className="hover-scale">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Community Guidelines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Be respectful and inclusive</li>
                  <li>• No hate speech or discrimination</li>
                  <li>• Share authentic experiences</li>
                  <li>• Support fellow community members</li>
                  <li>• Keep discussions constructive</li>
                </ul>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* Create Group Dialog */}
      <CreateGroup 
        open={isCreateGroupOpen}
        onOpenChange={setIsCreateGroupOpen}
      />
    </div>
  );
};

export default Community;