import React from 'react';
import { useState } from 'react';
import { useCommunity } from '@/hooks/useCommunity';
import { useGroups } from '@/hooks/useGroups';
import { CreatePost } from '@/components/community/CreatePost';
import { PostCard } from '@/components/community/PostCard';
import { GroupCard } from '@/components/community/GroupCard';
import { CreateGroup } from '@/components/community/CreateGroup';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  TrendingUp, 
  Clock, 
  Hash, 
  Search, 
  Filter,
  Loader,
  MessageSquare,
  Plus
} from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type CommunityPost = Database['public']['Tables']['community_posts']['Row'];

const Community = () => {
  const { 
    posts, 
    loading, 
    error, 
    fetchPosts, 
    createPost, 
    toggleLike, 
    addComment 
  } = useCommunity();
  const { groups, myGroups, loading: groupsLoading } = useGroups();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  // Popular tags (in a real app, these would come from the backend)
  const popularTags = [
    'community', 'support', 'events', 'pride', 'resources', 
    'questions', 'introductions', 'advice', 'local', 'activism'
  ];

  const handleCreatePost = async (postData: any) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to share posts with the community.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await createPost({
      ...postData,
      user_id: user.id,
    });

    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Post shared!",
        description: "Your post has been shared with the community.",
      });
      fetchPosts(); // Refresh posts
    }
  };

  const handleLike = async (postId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to like posts.",
        variant: "destructive",
      });
      return;
    }

    const { liked, error } = await toggleLike(postId);
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      fetchPosts(); // Refresh to show updated likes
    }
  };

  const handleComment = async (postId: string, content: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to comment on posts.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await addComment(postId, content);
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Comment added!",
        description: "Your comment has been posted.",
      });
      fetchPosts(); // Refresh to show new comment
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
    // In a real app, different tabs would have different sorting/filtering
    switch (tab) {
      case 'trending':
        // Fetch trending posts (most liked in last 24h)
        break;
      case 'following':
        // Fetch posts from followed users
        break;
      default:
        fetchPosts();
    }
  };

  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <CardContent>
              <p className="text-destructive mb-4">Error loading community: {error}</p>
              <Button onClick={() => fetchPosts()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">
            Community Hub
          </h1>
          <p className="text-lg text-muted-foreground">
            Connect, share, and engage with the LGBTQ+ community
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Create Post */}
            {user && (
              <CreatePost onPostCreate={handleCreatePost} />
            )}

            {/* Filter Bar */}
            <Card className="p-4">
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search posts..."
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
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>

              {showFilters && (
                <div className="space-y-3 pt-3 border-t">
                  <h4 className="text-sm font-medium">Filter by tags:</h4>
                  <div className="flex flex-wrap gap-2">
                    {popularTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={selectedTags.includes(tag) ? "default" : "outline"}
                        className="cursor-pointer hover:bg-primary/10 transition-colors"
                        onClick={() => toggleTag(tag)}
                      >
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                  {selectedTags.length > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedTags([])}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              )}
            </Card>

            {/* Feed Tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange}>
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
                  <Users className="h-4 w-4" />
                  Following
                </TabsTrigger>
                <TabsTrigger value="groups" className="gap-2">
                  <Users className="h-4 w-4" />
                  Groups
                </TabsTrigger>
              </TabsList>

              <TabsContent value="recent" className="mt-6">
                {/* Loading State */}
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Loading posts...</span>
                  </div>
                )}

                {/* Empty State */}
                {!loading && posts.length === 0 && (
                  <Card className="p-8 text-center">
                    <CardContent>
                      <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-xl font-semibold mb-2">No posts yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Be the first to start a conversation in the community!
                      </p>
                      {user && (
                        <Button className="bg-gradient-primary">
                          Create First Post
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Posts Feed */}
                {!loading && posts.length > 0 && (
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onLike={handleLike}
                        onComment={handleComment}
                        currentUserId={user?.id}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="trending" className="mt-6">
                <div className="text-center py-8">
                  <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Trending Posts</h3>
                  <p className="text-muted-foreground">
                    Most popular posts from the community
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="following" className="mt-6">
                <div className="text-center py-8">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Following Feed</h3>
                  <p className="text-muted-foreground">
                    Posts from people you follow will appear here
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="groups" className="mt-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Community Groups</h2>
                      <p className="text-muted-foreground">Join groups to connect with like-minded people</p>
                    </div>
                    {user && (
                      <Button onClick={() => setIsCreateGroupOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Group
                      </Button>
                    )}
                  </div>

                  {user && myGroups.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">My Groups</h3>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {myGroups.map((group) => (
                          <GroupCard key={group.id} group={group} showJoinButton={false} />
                        ))}
                      </div>
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
                              <div className="h-3 bg-muted rounded w-1/2"></div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : groups.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {groups.map((group) => (
                          <GroupCard key={group.id} group={group} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-semibold">No Groups Yet</h3>
                        <p className="text-muted-foreground mb-4">
                          Be the first to create a community group
                        </p>
                        {user && (
                          <Button onClick={() => setIsCreateGroupOpen(true)}>
                            Create First Group
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Load More */}
            {!loading && posts.length > 0 && (
              <div className="text-center">
                <Button variant="outline" size="lg">
                  Load More Posts
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Community Stats */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-4">Community Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Members</span>
                    <span className="font-medium">1,234</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Posts Today</span>
                    <span className="font-medium">42</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Posts</span>
                    <span className="font-medium">8,567</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trending Tags */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Trending Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {popularTags.slice(0, 6).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => toggleTag(tag)}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Community Guidelines */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Community Guidelines</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Be respectful and inclusive</li>
                  <li>• No hate speech or discrimination</li>
                  <li>• Share authentic experiences</li>
                  <li>• Support fellow community members</li>
                  <li>• Keep discussions constructive</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <CreateGroup 
        open={isCreateGroupOpen}
        onOpenChange={setIsCreateGroupOpen}
      />
    </div>
  );
};

export default Community;