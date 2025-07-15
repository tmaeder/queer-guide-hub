import { useState, useEffect } from "react";
import { useContent } from "@/hooks/useContent";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Calendar, User, Search, Heart, ArrowRight, Tag } from "lucide-react";
import { format } from "date-fns";

export default function Blog() {
  const { content, categories, loading, searchContent } = useContent();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Filter for blog posts only
  const blogPosts = content.filter(item => item.content_type === "blog_post");
  const featuredPost = blogPosts.find(post => post.featured_image) || blogPosts[0];
  const recentPosts = blogPosts.slice(0, 4);
  const popularPosts = [...blogPosts].sort(() => 0.5 - Math.random()).slice(0, 3);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchContent(searchQuery);
      const blogResults = results.filter(item => item.content_type === "blog_post");
      setSearchResults(blogResults);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const filterPosts = (category: string) => {
    if (category === "All Posts") return blogPosts;
    return blogPosts.filter(post => 
      post.categories?.some(cat => cat.name === category)
    );
  };

  const getCategoryColor = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category ? category.color : "#6366f1";
  };

  useEffect(() => {
    if (searchQuery) {
      const debounceTimer = setTimeout(handleSearch, 300);
      return () => clearTimeout(debounceTimer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading blog posts...</div>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <BookOpen className="h-12 w-12 text-primary" />
          <h1 className="text-4xl font-bold gradient-text">The Queer Guide Blog</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Stories, insights, and resources from the LGBTQ+ community. 
          Learn, connect, and stay informed with our latest articles.
        </p>
      </div>

      {/* Search and Navigation */}
      <div className="mb-12">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button className="gap-2">
            <Heart className="h-4 w-4" />
            Subscribe to Updates
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Search Results */}
          {searchQuery && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold mb-6">
                {isSearching ? "Searching..." : `Search Results for "${searchQuery}"`}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {searchResults.map((post) => (
                  <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="h-48 bg-gradient-primary"></div>
                    <CardContent className="p-6">
                      {post.categories && post.categories.length > 0 && (
                        <Badge 
                          style={{ 
                            backgroundColor: getCategoryColor(post.categories[0].name) + "20",
                            color: getCategoryColor(post.categories[0].name)
                          }}
                        >
                          {post.categories[0].name}
                        </Badge>
                      )}
                      <h3 className="text-lg font-semibold mt-3 mb-2">{post.title}</h3>
                      <p className="text-muted-foreground text-sm mb-4">{post.excerpt}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {post.author?.display_name || "The Queer Guide Team"}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(post.published_at || post.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="gap-2">
                        Read Article
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {searchResults.length === 0 && !isSearching && (
                <p className="text-center text-muted-foreground">No articles found.</p>
              )}
            </section>
          )}

          {/* Featured Post */}
          {!searchQuery && featuredPost && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold mb-6">Featured Article</h2>
              <Card className="overflow-hidden">
                <div className="md:flex">
                  <div className="md:w-1/2">
                    <div className="h-64 md:h-full bg-gradient-primary"></div>
                  </div>
                  <div className="md:w-1/2 p-6">
                    {featuredPost.categories && featuredPost.categories.length > 0 && (
                      <Badge 
                        style={{ 
                          backgroundColor: getCategoryColor(featuredPost.categories[0].name) + "20",
                          color: getCategoryColor(featuredPost.categories[0].name)
                        }}
                      >
                        {featuredPost.categories[0].name}
                      </Badge>
                    )}
                    <h3 className="text-2xl font-bold mt-3 mb-3">{featuredPost.title}</h3>
                    <p className="text-muted-foreground mb-4">{featuredPost.excerpt}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {featuredPost.author?.display_name || "The Queer Guide Team"}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(featuredPost.published_at || featuredPost.created_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <Button className="gap-2">
                      Read More
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* Articles by Category */}
          {!searchQuery && (
            <section>
              <Tabs defaultValue="All Posts" className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-8">
                  <TabsTrigger value="All Posts" className="text-xs">All</TabsTrigger>
                  {categories.slice(0, 7).map((category) => (
                    <TabsTrigger key={category.id} value={category.name} className="text-xs">
                      {category.name.split(" ")[0]}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="All Posts">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {blogPosts.map((post) => (
                      <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="h-48 bg-gradient-primary"></div>
                        <CardContent className="p-6">
                          {post.categories && post.categories.length > 0 && (
                            <Badge 
                              style={{ 
                                backgroundColor: getCategoryColor(post.categories[0].name) + "20",
                                color: getCategoryColor(post.categories[0].name)
                              }}
                            >
                              {post.categories[0].name}
                            </Badge>
                          )}
                          <h3 className="text-lg font-semibold mt-3 mb-2">{post.title}</h3>
                          <p className="text-muted-foreground text-sm mb-4">{post.excerpt}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {post.author?.display_name || "The Queer Guide Team"}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(post.published_at || post.created_at), "MMM d, yyyy")}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="gap-2">
                            Read Article
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {categories.map((category) => (
                  <TabsContent key={category.id} value={category.name}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {filterPosts(category.name).map((post) => (
                        <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                          <div className="h-48 bg-gradient-primary"></div>
                          <CardContent className="p-6">
                            {post.categories && post.categories.length > 0 && (
                              <Badge 
                                style={{ 
                                  backgroundColor: getCategoryColor(post.categories[0].name) + "20",
                                  color: getCategoryColor(post.categories[0].name)
                                }}
                              >
                                {post.categories[0].name}
                              </Badge>
                            )}
                            <h3 className="text-lg font-semibold mt-3 mb-2">{post.title}</h3>
                            <p className="text-muted-foreground text-sm mb-4">{post.excerpt}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {post.author?.display_name || "The Queer Guide Team"}
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(post.published_at || post.created_at), "MMM d, yyyy")}
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="gap-2">
                              Read Article
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Newsletter Signup */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3">Stay Updated</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Get our latest articles and community updates delivered to your inbox.
              </p>
              <div className="space-y-3">
                <Input placeholder="Your email address" type="email" />
                <Button className="w-full gap-2">
                  <Heart className="h-4 w-4" />
                  Subscribe
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Popular Posts */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Popular Articles</h3>
              <div className="space-y-4">
                {recentPosts.map((post) => (
                  <div key={post.id} className="flex gap-3">
                    <div className="w-16 h-16 bg-gradient-primary rounded flex-shrink-0"></div>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm leading-tight mb-1">{post.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(post.published_at || post.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Categories */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Categories</h3>
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between">
                    <span className="text-sm">{category.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {filterPosts(category.name).length}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Popular Tags</h3>
              <div className="flex flex-wrap gap-2">
                {["Safety", "Pride", "Travel", "Business", "Community", "Youth", "Technology", "Events"].map((tag) => (
                  <Button key={tag} variant="outline" size="sm" className="gap-1">
                    <Tag className="h-3 w-3" />
                    {tag}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}