import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Calendar, User, Search, Heart, ArrowRight } from "lucide-react";
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

export default function Blog() {
  const navigate = useLocalizedNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Real blog posts - currently empty until blog content is added
  const blogPosts: Record<string, unknown>[] = [];

  const categories = ["All Posts", "Community", "Travel", "Business", "Events", "Resources"];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <BookOpen style={{ width: 48, height: 48 }} className="text-primary" />
          <h1 className="text-4xl font-bold text-foreground">
            The Queer Guide Blog
          </h1>
        </div>
        <p className="text-lg text-muted-foreground mx-auto">
          Stories, insights, and resources from the LGBTQ+ community.
          Learn, connect, and stay informed with our latest articles.
        </p>
      </div>

      {blogPosts.length === 0 ? (
        <>
          {/* Coming Soon Empty State */}
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-8">
            <div>
              <Card style={{ padding: 48, textAlign: 'center' }}>
                <BookOpen style={{ width: 64, height: 64, margin: '0 auto 16px' }} className="text-muted-foreground" />
                <h2 className="text-2xl font-bold mb-4">Blog Coming Soon</h2>
                <p className="text-muted-foreground mx-auto mb-6">
                  We're working on bringing you stories, insights, and resources from the LGBTQ+ community. In the meantime, explore our latest content:
                </p>
                <div className="flex justify-center gap-4 flex-wrap">
                  <Button variant="outline" onClick={() => navigate('/news')}>Browse News</Button>
                  <Button variant="outline" onClick={() => navigate('/resources')}>Explore Resources</Button>
                </div>
              </Card>
            </div>

            {/* Sidebar - only newsletter CTA */}
            <div className="flex flex-col gap-8">
              <Card>
                <CardContent>
                  <p className="font-semibold mb-3">Stay Updated</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Get our latest articles and community updates delivered to your inbox.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Input placeholder="Your email address" type="email" />
                    <Button style={{ width: '100%', display: 'flex', gap: 8 }}>
                      <Heart style={{ width: 16, height: 16 }} />
                      Subscribe
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Search and Navigation */}
          <div className="mb-12">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
              <div className="relative w-full md:w-96">
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16 }} className="text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 40 }}
                />
              </div>
              <Button style={{ display: 'flex', gap: 8 }}>
                <Heart style={{ width: 16, height: 16 }} />
                Subscribe to Updates
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-8">
            {/* Main Content */}
            <div>
              {/* Articles by Category */}
              <section>
                <Tabs defaultValue="All Posts" style={{ width: '100%' }}>
                  <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 32 }}>
                    {categories.map((category) => (
                      <TabsTrigger key={category} value={category} style={{ fontSize: '0.75rem' }}>
                        {category === "All Posts" ? "All" : category}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="All Posts">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {blogPosts.map((post) => (
                        <Card key={post.id} style={{ overflow: 'hidden', transition: 'box-shadow 0.2s' }}>
                          <div className="h-48 bg-muted"></div>
                          <CardContent>
                            <Badge variant="secondary">{post.category}</Badge>
                            <p className="font-semibold mt-3 mb-2 text-base">{post.title}</p>
                            <p className="text-sm text-muted-foreground mb-4">{post.excerpt}</p>
                            <div className="flex items-center gap-4 mb-4">
                              <div className="flex items-center gap-1">
                                <User style={{ width: 12, height: 12 }} />
                                <span className="text-xs text-muted-foreground">{post.author}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar style={{ width: 12, height: 12 }} />
                                <span className="text-xs text-muted-foreground">{post.publishDate}</span>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" style={{ display: 'flex', gap: 8 }}>
                              Read Article
                              <ArrowRight style={{ width: 12, height: 12 }} />
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
                          <Card key={post.id} style={{ overflow: 'hidden', transition: 'box-shadow 0.2s' }}>
                            <div className="h-48 bg-muted"></div>
                            <CardContent>
                              <Badge variant="secondary">{post.category}</Badge>
                              <p className="font-semibold mt-3 mb-2 text-base">{post.title}</p>
                              <p className="text-sm text-muted-foreground mb-4">{post.excerpt}</p>
                              <div className="flex items-center gap-4 mb-4">
                                <div className="flex items-center gap-1">
                                  <User style={{ width: 12, height: 12 }} />
                                  <span className="text-xs text-muted-foreground">{post.author}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar style={{ width: 12, height: 12 }} />
                                  <span className="text-xs text-muted-foreground">{post.publishDate}</span>
                                </div>
                              </div>
                              <Button variant="outline" size="sm" style={{ display: 'flex', gap: 8 }}>
                                Read Article
                                <ArrowRight style={{ width: 12, height: 12 }} />
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
            <div className="flex flex-col gap-8">
              {/* Newsletter Signup */}
              <Card>
                <CardContent>
                  <p className="font-semibold mb-3">Stay Updated</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Get our latest articles and community updates delivered to your inbox.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Input placeholder="Your email address" type="email" />
                    <Button style={{ width: '100%', display: 'flex', gap: 8 }}>
                      <Heart style={{ width: 16, height: 16 }} />
                      Subscribe
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Popular Posts */}
              <Card>
                <CardContent>
                  <p className="font-semibold mb-4">Popular Articles</p>
                  <div className="flex flex-col gap-4">
                    {blogPosts.slice(0, 3).map((post) => (
                      <div key={post.id} className="flex gap-3">
                        <div className="w-16 h-16 shrink-0 rounded bg-muted"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-tight mb-1">{post.title}</p>
                          <span className="text-xs text-muted-foreground">
                            {post.publishDate}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Categories */}
              <Card>
                <CardContent>
                  <p className="font-semibold mb-4">Categories</p>
                  <div className="flex flex-col gap-2">
                    {categories.slice(1).map((category) => (
                      <div key={category} className="flex items-center justify-between">
                        <p className="text-sm">{category}</p>
                        <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                          {blogPosts.filter(p => p.category === category).length}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
