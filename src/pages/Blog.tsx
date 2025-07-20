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

  // Sample blog posts for static display
  const blogPosts = [
    {
      id: 1,
      title: "Welcome to The Queer Guide Blog",
      excerpt: "Discover stories, insights, and resources from the LGBTQ+ community.",
      category: "Community",
      author: "The Queer Guide Team",
      publishDate: "2024-01-15",
      readTime: "3 min read"
    },
    {
      id: 2,
      title: "Safe Travel Tips for LGBTQ+ Travelers",
      excerpt: "Essential safety tips and resources for queer travelers exploring the world.",
      category: "Travel",
      author: "Alex Rivera",
      publishDate: "2024-01-10",
      readTime: "5 min read"
    },
    {
      id: 3,
      title: "Building Inclusive Businesses",
      excerpt: "How to create welcoming spaces for LGBTQ+ customers and employees.",
      category: "Business",
      author: "Sam Chen",
      publishDate: "2024-01-05",
      readTime: "4 min read"
    }
  ];

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
          {/* Featured Post */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Featured Article</h2>
            <Card className="overflow-hidden">
              <div className="md:flex">
                <div className="md:w-1/2">
                  <div className="h-64 md:h-full bg-gradient-primary"></div>
                </div>
                <div className="md:w-1/2 p-6">
                  <Badge variant="secondary">Community</Badge>
                  <h3 className="text-2xl font-bold mt-3 mb-3">{blogPosts[0].title}</h3>
                  <p className="text-muted-foreground mb-4">{blogPosts[0].excerpt}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {blogPosts[0].author}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {blogPosts[0].publishDate}
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
                      {blogPosts.filter(post => post.category === category).length}
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