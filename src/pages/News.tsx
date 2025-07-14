import { useState, useEffect } from "react";
import { useNews } from "@/hooks/useNews";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFilters } from "@/components/news/NewsFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Newspaper, TrendingUp, Star, Globe, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function News() {
  const { 
    articles, 
    categories, 
    loading, 
    error, 
    fetchArticles, 
    incrementViews,
    getFeaturedArticles,
    getTrendingTags
  } = useNews();
  
  const [featuredArticles, setFeaturedArticles] = useState<any[]>([]);
  const [trendingTags, setTrendingTags] = useState<{ tag: string; count: number }[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [isImporting, setIsImporting] = useState(false);

  const handleImportNews = async () => {
    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-news', {
        body: { manual_trigger: true }
      });
      
      if (error) {
        toast.error(`Import failed: ${error.message}`);
      } else {
        toast.success(`Successfully imported ${data.articlesProcessed} articles from ${data.sources} sources!`);
        // Refresh the articles
        fetchArticles();
      }
    } catch (err: any) {
      toast.error(`Import error: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    const loadAdditionalData = async () => {
      const [featured, trending] = await Promise.all([
        getFeaturedArticles(),
        getTrendingTags()
      ]);
      setFeaturedArticles(featured);
      setTrendingTags(trending);
    };

    if (!loading) {
      loadAdditionalData();
    }
  }, [loading]);

  const handleFiltersChange = (filters: any) => {
    fetchArticles(filters);
  };

  const handleViewArticle = (articleId: string) => {
    incrementViews(articleId);
  };


  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "all") {
      fetchArticles();
    } else if (value === "featured") {
      // Filter featured articles locally
    } else {
      fetchArticles({ category: value });
    }
  };

  const getFilteredArticles = () => {
    if (activeTab === "featured") {
      return featuredArticles;
    }
    return articles;
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-destructive/20">
          <CardContent className="pt-6">
            <p className="text-destructive">Error loading news: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Globe className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            LGBTQ+ News Hub
          </h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-4">
          Stay informed with the latest news, developments, and stories from the LGBTQ+ community worldwide
        </p>
        <Button 
          onClick={handleImportNews} 
          disabled={isImporting}
          variant="outline"
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {isImporting ? "Importing..." : "Import Latest News"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Articles</CardTitle>
            <Newspaper className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{articles.length}</div>
            <p className="text-xs text-muted-foreground">
              Updated continuously
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Featured Stories</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{featuredArticles.length}</div>
            <p className="text-xs text-muted-foreground">
              Editor's picks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trending Tags</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trendingTags.length}</div>
            <p className="text-xs text-muted-foreground">
              Past 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar with filters */}
        <div className="lg:col-span-1">
          <NewsFilters
            categories={categories}
            onFiltersChange={handleFiltersChange}
            trendingTags={trendingTags}
          />
        </div>

        {/* Main content */}
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All News</TabsTrigger>
              <TabsTrigger value="featured">Featured</TabsTrigger>
              <TabsTrigger value="rights-legal">Rights</TabsTrigger>
              <TabsTrigger value="politics">Politics</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="space-y-6">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-48 w-full" />
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-16 w-full mb-4" />
                        <Skeleton className="h-8 w-24" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : getFilteredArticles().length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Newspaper className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No articles found</h3>
                    <p className="text-muted-foreground">
                      Try adjusting your filters or check back later for new content.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {getFilteredArticles().map((article) => (
                    <NewsCard
                      key={article.id}
                      article={article}
                      onViewArticle={handleViewArticle}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}