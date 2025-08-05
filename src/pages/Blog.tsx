import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Calendar, User, Search, Heart, ArrowRight, Tag } from "lucide-react";
import { format } from "date-fns";

export default function Blog() {
  const [searchQuery, setSearchQuery] = useState("");

  // Real blog posts - currently empty until blog content is added
  const blogPosts: any[] = [];

  const categories = ["All Posts", "Community", "Travel", "Business", "Events", "Resources"];

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
          {/* No Featured Post - Empty state */}
          {blogPosts.length === 0 && (
            <section className="mb-12">
              <Card className="p-12 text-center">
                <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-2xl font-semibold mb-2">No Blog Posts Yet</h3>
                <p className="text-muted-foreground">
                  Blog content will appear here once articles are published.
                </p>
              </Card>
            </section>
          )}

          {/* Articles by Category */}
          <section>
            <Tabs defaultValue="All Posts" className="w-full">
              <TabsList className="grid w-full grid-cols-6 mb-8">
                {categories.map((category) => (
                  <TabsTrigger key={category} value={category} className="text-xs">
                    {category === "All Posts" ? "All" : category}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="All Posts">
                {blogPosts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {blogPosts.map((post) => (
                      <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="h-48 bg-gradient-primary"></div>
                        <CardContent className="p-6">
                          <Badge variant="secondary">{post.category}</Badge>
                          <h3 className="text-lg font-semibold mt-3 mb-2">{post.title}</h3>
                          <p className="text-muted-foreground text-sm mb-4">{post.excerpt}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {post.author}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {post.publishDate}
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
                ) : (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No blog posts available yet.</p>
                  </div>
                )}
              </TabsContent>

              {categories.slice(1).map((category) => (
                <TabsContent key={category} value={category}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {blogPosts.filter(post => post.category === category).map((post) => (
                      <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="h-48 bg-gradient-primary"></div>
                        <CardContent className="p-6">
                          <Badge variant="secondary">{post.category}</Badge>
                          <h3 className="text-lg font-semibold mt-3 mb-2">{post.title}</h3>
                          <p className="text-muted-foreground text-sm mb-4">{post.excerpt}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {post.author}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {post.publishDate}
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
              {blogPosts.length > 0 ? (
                <div className="space-y-4">
                  {blogPosts.slice(0, 3).map((post) => (
                    <div key={post.id} className="flex gap-3">
                      <div className="w-16 h-16 bg-gradient-primary rounded flex-shrink-0"></div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm leading-tight mb-1">{post.title}</h4>
                        <p className="text-xs text-muted-foreground">
                          {post.publishDate}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No popular articles yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Categories */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Categories</h3>
              <div className="space-y-2">
                {categories.slice(1).map((category) => (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-sm">{category}</span>
                    <Badge variant="secondary" className="text-xs">
                      0
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