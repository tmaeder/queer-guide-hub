import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Calendar, User, Search, Heart, ArrowRight, Tag } from "lucide-react";

export default function Blog() {
  const [searchQuery, setSearchQuery] = useState("");

  const featuredPost = {
    id: 1,
    title: "Building Safer Spaces: How We Verify LGBTQ+ Friendly Venues",
    excerpt: "A deep dive into our verification process and why it matters for community safety. Learn how we work with local organizations and venue owners to ensure authentic, welcoming environments.",
    author: "The Queer Guide Team",
    date: "March 15, 2025",
    readTime: "8 min read",
    category: "Safety & Verification",
    image: "/api/placeholder/600/300",
    featured: true
  };

  const blogPosts = [
    {
      id: 2,
      title: "Pride Month 2025: A Global Celebration Guide",
      excerpt: "Discover Pride events happening worldwide and tips for celebrating safely no matter where you are.",
      author: "Jordan Taylor",
      date: "March 10, 2025",
      readTime: "6 min read",
      category: "Events & Culture",
      image: "/api/placeholder/400/250"
    },
    {
      id: 3,
      title: "The Economics of LGBTQ+ Business: Supporting Our Community",
      excerpt: "Why supporting LGBTQ+ owned businesses matters and how our marketplace helps connect community members with these entrepreneurs.",
      author: "Sam Chen",
      date: "March 8, 2025",
      readTime: "5 min read",
      category: "Business & Economics",
      image: "/api/placeholder/400/250"
    },
    {
      id: 4,
      title: "Digital Safety for LGBTQ+ Youth: A Parent's Guide",
      excerpt: "Essential tips for keeping LGBTQ+ young people safe online while allowing them to find community and support.",
      author: "Alex Rivera",
      date: "March 5, 2025",
      readTime: "7 min read",
      category: "Safety & Education",
      image: "/api/placeholder/400/250"
    },
    {
      id: 5,
      title: "Travel Tips: Staying Safe as an LGBTQ+ Traveler",
      excerpt: "Essential advice for LGBTQ+ travelers, from research tips to emergency planning and finding community abroad.",
      author: "Community Contributors",
      date: "March 1, 2025",
      readTime: "10 min read",
      category: "Travel & Safety",
      image: "/api/placeholder/400/250"
    },
    {
      id: 6,
      title: "Community Spotlight: Local Heroes Making a Difference",
      excerpt: "Meet the incredible individuals and organizations working to create safer, more inclusive spaces in their communities.",
      author: "Jordan Taylor",
      date: "February 25, 2025",
      readTime: "4 min read",
      category: "Community Stories",
      image: "/api/placeholder/400/250"
    },
    {
      id: 7,
      title: "The Technology Behind The Queer Guide",
      excerpt: "How we use technology to create secure, accessible, and inclusive experiences for our community members.",
      author: "Sam Chen",
      date: "February 20, 2025",
      readTime: "6 min read",
      category: "Technology",
      image: "/api/placeholder/400/250"
    }
  ];

  const categories = [
    "All Posts",
    "Safety & Verification",
    "Events & Culture",
    "Business & Economics",
    "Safety & Education",
    "Travel & Safety",
    "Community Stories",
    "Technology"
  ];

  const recentPosts = blogPosts.slice(0, 4);
  const popularPosts = [...blogPosts].sort(() => 0.5 - Math.random()).slice(0, 3);

  const filterPosts = (category: string) => {
    if (category === "All Posts") return blogPosts;
    return blogPosts.filter(post => post.category === category);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      "Safety & Verification": "bg-red-100 text-red-800",
      "Events & Culture": "bg-purple-100 text-purple-800",
      "Business & Economics": "bg-green-100 text-green-800",
      "Safety & Education": "bg-blue-100 text-blue-800",
      "Travel & Safety": "bg-orange-100 text-orange-800",
      "Community Stories": "bg-pink-100 text-pink-800",
      "Technology": "bg-gray-100 text-gray-800"
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
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
                  <Badge className={getCategoryColor(featuredPost.category)}>
                    {featuredPost.category}
                  </Badge>
                  <h3 className="text-2xl font-bold mt-3 mb-3">{featuredPost.title}</h3>
                  <p className="text-muted-foreground mb-4">{featuredPost.excerpt}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {featuredPost.author}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {featuredPost.date}
                    </div>
                    <span>{featuredPost.readTime}</span>
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
              <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-8">
                {categories.map((category) => (
                  <TabsTrigger key={category} value={category} className="text-xs">
                    {category.split(" ")[0]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map((category) => (
                <TabsContent key={category} value={category}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filterPosts(category).map((post) => (
                      <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="h-48 bg-gradient-primary"></div>
                        <CardContent className="p-6">
                          <Badge className={getCategoryColor(post.category)}>
                            {post.category}
                          </Badge>
                          <h3 className="text-lg font-semibold mt-3 mb-2">{post.title}</h3>
                          <p className="text-muted-foreground text-sm mb-4">{post.excerpt}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {post.author}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {post.date}
                            </div>
                            <span>{post.readTime}</span>
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
                {popularPosts.map((post) => (
                  <div key={post.id} className="flex gap-3">
                    <div className="w-16 h-16 bg-gradient-primary rounded flex-shrink-0"></div>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm leading-tight mb-1">{post.title}</h4>
                      <p className="text-xs text-muted-foreground">{post.date}</p>
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
                      {filterPosts(category).length}
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