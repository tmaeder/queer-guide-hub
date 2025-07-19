import { useState, useEffect } from "react";
import { useNews } from "@/hooks/useNews";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFilters } from "@/components/news/NewsFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Newspaper, TrendingUp, Star, Globe, Download, Loader } from "lucide-react";
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
  const [trendingTags, setTrendingTags] = useState<{
    tag: string;
    count: number;
  }[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [isImporting, setIsImporting] = useState(false);
  const handleImportNews = async () => {
    setIsImporting(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('fetch-news', {
        body: {
          manual_trigger: true
        }
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
      const [featured, trending] = await Promise.all([getFeaturedArticles(), getTrendingTags()]);
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
      fetchArticles({
        category: value
      });
    }
  };
  const getFilteredArticles = () => {
    if (activeTab === "featured") {
      return featuredArticles;
    }
    return articles;
  };
  if (error) {
    return <div className="container mx-auto px-4 py-8">
        <Card className="border-destructive/20">
          <CardContent className="pt-6">
            <p className="text-destructive">Error loading news: {error}</p>
          </CardContent>
        </Card>
      </div>;
  }
  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">
              LGBTQ+ News Hub
            </h1>
            <p className="text-lg text-muted-foreground">
              Stay informed with the latest news, developments, and stories from the LGBTQ+ community worldwide
            </p>
          </div>
          <Button 
            onClick={handleImportNews} 
            disabled={isImporting} 
            className="bg-primary gap-2"
          >
            <Download className="h-4 w-4" />
            {isImporting ? "Importing..." : "Import Latest News"}
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <NewsFilters categories={categories} onFiltersChange={handleFiltersChange} trendingTags={trendingTags} />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading articles...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && getFilteredArticles().length === 0 && (
          <Card className="p-8 text-center">
            <CardContent>
              <Newspaper className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No articles found</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your filters or check back later for new content.
              </p>
              <Button 
                onClick={handleImportNews} 
                disabled={isImporting} 
                className="bg-primary gap-2"
              >
                <Download className="h-4 w-4" />
                Import Latest News
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Articles Grid */}
        {!loading && getFilteredArticles().length > 0 && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                Found {getFilteredArticles().length} article{getFilteredArticles().length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getFilteredArticles().map(article => (
                <NewsCard 
                  key={article.id} 
                  article={article} 
                  onViewArticle={handleViewArticle} 
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}