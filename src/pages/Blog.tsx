import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Calendar, User, Search, Heart, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

export default function Blog() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Real blog posts - currently empty until blog content is added
  const blogPosts: Record<string, unknown>[] = [];

  const categories = ["All Posts", "Community", "Travel", "Business", "Events", "Resources"];

  return (
    <Container sx={{ py: 4 }}>
      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2 }}>
          <BookOpen style={{ width: 48, height: 48 }} color="var(--mui-palette-primary-main)" />
          <Typography variant="h3" sx={{ fontWeight: 700, background: 'linear-gradient(to right, var(--mui-palette-primary-main), var(--mui-palette-secondary-main))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>The Queer Guide Blog</Typography>
        </Box>
        <Typography variant="h6" color="text.secondary" sx={{ mx: 'auto' }}>
          Stories, insights, and resources from the LGBTQ+ community.
          Learn, connect, and stay informed with our latest articles.
        </Typography>
      </Box>

      {blogPosts.length === 0 ? (
        <>
          {/* Coming Soon Empty State */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 1fr' }, gap: 4 }}>
            <Box>
              <Card style={{ padding: 48, textAlign: 'center' }}>
                <BookOpen style={{ width: 64, height: 64, margin: '0 auto 16px', color: 'var(--mui-palette-text-secondary)' }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Blog Coming Soon</Typography>
                <Typography color="text.secondary" sx={{ mx: 'auto', mb: 3 }}>
                  We're working on bringing you stories, insights, and resources from the LGBTQ+ community. In the meantime, explore our latest content:
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Button variant="outline" onClick={() => navigate('/news')}>Browse News</Button>
                  <Button variant="outline" onClick={() => navigate('/resources')}>Explore Resources</Button>
                </Box>
              </Card>
            </Box>

            {/* Sidebar - only newsletter CTA */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Stay Updated</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Get our latest articles and community updates delivered to your inbox.
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Input placeholder="Your email address" type="email" />
                    <Button style={{ width: '100%', display: 'flex', gap: 8 }}>
                      <Heart style={{ width: 16, height: 16 }} />
                      Subscribe
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </>
      ) : (
        <>
          {/* Search and Navigation */}
          <Box sx={{ mb: 6 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
              <Box sx={{ position: 'relative', width: { xs: '100%', md: '24rem' } }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--mui-palette-text-secondary)' }} />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 40 }}
                />
              </Box>
              <Button style={{ display: 'flex', gap: 8 }}>
                <Heart style={{ width: 16, height: 16 }} />
                Subscribe to Updates
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 1fr' }, gap: 4 }}>
            {/* Main Content */}
            <Box>
              {/* Articles by Category */}
              <Box component="section">
                <Tabs defaultValue="All Posts" style={{ width: '100%' }}>
                  <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 32 }}>
                    {categories.map((category) => (
                      <TabsTrigger key={category} value={category} style={{ fontSize: '0.75rem' }}>
                        {category === "All Posts" ? "All" : category}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="All Posts">
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                      {blogPosts.map((post) => (
                        <Card key={post.id} style={{ overflow: 'hidden', transition: 'box-shadow 0.2s' }}>
                          <Box sx={{ height: 192, background: 'linear-gradient(to right, var(--mui-palette-primary-main), var(--mui-palette-secondary-main))' }}></Box>
                          <CardContent sx={{ p: 3 }}>
                            <Badge variant="secondary">{post.category}</Badge>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1.5, mb: 1 }}>{post.title}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{post.excerpt}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <User style={{ width: 12, height: 12 }} />
                                <Typography variant="caption" color="text.secondary">{post.author}</Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Calendar style={{ width: 12, height: 12 }} />
                                <Typography variant="caption" color="text.secondary">{post.publishDate}</Typography>
                              </Box>
                            </Box>
                            <Button variant="outline" size="sm" style={{ display: 'flex', gap: 8 }}>
                              Read Article
                              <ArrowRight style={{ width: 12, height: 12 }} />
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </Box>
                  </TabsContent>

                  {categories.slice(1).map((category) => (
                    <TabsContent key={category} value={category}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                        {blogPosts.filter(post => post.category === category).map((post) => (
                          <Card key={post.id} style={{ overflow: 'hidden', transition: 'box-shadow 0.2s' }}>
                            <Box sx={{ height: 192, background: 'linear-gradient(to right, var(--mui-palette-primary-main), var(--mui-palette-secondary-main))' }}></Box>
                            <CardContent sx={{ p: 3 }}>
                              <Badge variant="secondary">{post.category}</Badge>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1.5, mb: 1 }}>{post.title}</Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{post.excerpt}</Typography>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <User style={{ width: 12, height: 12 }} />
                                  <Typography variant="caption" color="text.secondary">{post.author}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Calendar style={{ width: 12, height: 12 }} />
                                  <Typography variant="caption" color="text.secondary">{post.publishDate}</Typography>
                                </Box>
                              </Box>
                              <Button variant="outline" size="sm" style={{ display: 'flex', gap: 8 }}>
                                Read Article
                                <ArrowRight style={{ width: 12, height: 12 }} />
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </Box>
                    </TabsContent>
                  ))}
                </Tabs>
              </Box>
            </Box>

            {/* Sidebar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Newsletter Signup */}
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Stay Updated</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Get our latest articles and community updates delivered to your inbox.
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Input placeholder="Your email address" type="email" />
                    <Button style={{ width: '100%', display: 'flex', gap: 8 }}>
                      <Heart style={{ width: 16, height: 16 }} />
                      Subscribe
                    </Button>
                  </Box>
                </CardContent>
              </Card>

              {/* Popular Posts */}
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Typography sx={{ fontWeight: 600, mb: 2 }}>Popular Articles</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {blogPosts.slice(0, 3).map((post) => (
                      <Box key={post.id} sx={{ display: 'flex', gap: 1.5 }}>
                        <Box sx={{ width: 64, height: 64, flexShrink: 0, borderRadius: 1, background: 'linear-gradient(to right, var(--mui-palette-primary-main), var(--mui-palette-secondary-main))' }}></Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4, mb: 0.5 }}>{post.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {post.publishDate}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* Categories */}
              <Card>
                <CardContent sx={{ p: 3 }}>
                  <Typography sx={{ fontWeight: 600, mb: 2 }}>Categories</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {categories.slice(1).map((category) => (
                      <Box key={category} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{category}</Typography>
                        <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                          {blogPosts.filter(p => p.category === category).length}
                        </Badge>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </>
      )}
    </Container>
  );
}
