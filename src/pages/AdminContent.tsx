import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useContent } from "@/hooks/useContent";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Tag, Search, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ContentCard } from "@/components/content/ContentCard";
import { ContentFilters } from "@/components/content/ContentFilters";
import { ContentStats } from "@/components/content/ContentStats";

export default function AdminContent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { 
    content, 
    categories, 
    tags, 
    loading, 
    fetchContent, 
    deleteContent 
  } = useContent();
  const { toast } = useToast();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAuthor, setSelectedAuthor] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    // Add additional security check with loading state
    if (!rolesLoading) {
      if (!canManageContent()) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access the admin panel.",
          variant: "destructive"
        });
        navigate("/");
        return;
      }
    }

    // Only fetch content if user has proper permissions
    if (!rolesLoading && canManageContent()) {
      fetchContent({ status: undefined });
    }
  }, [user, rolesLoading, canManageContent, navigate, toast, fetchContent]);

  // Get unique authors for filter
  const authors = Array.from(
    new Set(content.map(c => c.author_id).filter(Boolean))
  ).map(authorId => {
    const authorContent = content.find(c => c.author_id === authorId);
    return {
      id: authorId!,
      name: authorContent?.author?.display_name || "Unknown"
    };
  });

  const filteredContent = content.filter(item => {
    const matchesSearch = searchQuery === "" || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.excerpt && item.excerpt.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = selectedType === "all" || item.content_type === selectedType;
    const matchesStatus = selectedStatus === "all" || item.status === selectedStatus;
    const matchesCategory = selectedCategory === "all" || 
      (item.categories && item.categories.some(cat => cat.id === selectedCategory));
    const matchesTags = selectedTags.length === 0 || 
      (item.tags && selectedTags.some(tagId => item.tags?.some(tag => tag.id === tagId)));
    const matchesAuthor = selectedAuthor === "all" || item.author_id === selectedAuthor;

    return matchesSearch && matchesType && matchesStatus && matchesCategory && matchesTags && matchesAuthor;
  });

  const handleDelete = async (id: string) => {
    try {
      await deleteContent(id);
      toast({
        title: "Success",
        description: "Content deleted successfully"
      });
    } catch (error) {
      console.error("Failed to delete content:", error);
      toast({
        title: "Error",
        description: "Failed to delete content",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (id: string) => {
    navigate(`/admin/content/${id}`);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedStatus("all");
    setSelectedCategory("all");
    setSelectedTags([]);
    setSelectedAuthor("all");
  };


  if (loading || rolesLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading content management system...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!canManageContent()) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access the content management system.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Management</h1>
          <p className="text-muted-foreground">Create, manage, and publish your content</p>
        </div>
        <Button onClick={() => navigate("/admin/content/new")} size="lg" className="gap-2">
          <Plus className="h-5 w-5" />
          Create Content
        </Button>
      </div>

      {/* Tabs for different management sections */}
      <Tabs defaultValue="content" className="space-y-6">
        <TabsList>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Content Management Tab */}
        <TabsContent value="content" className="space-y-6">
          {/* Statistics */}
          <ContentStats content={content} />

          {/* Filters */}
          <ContentFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedType={selectedType}
            onTypeChange={setSelectedType}
            selectedStatus={selectedStatus}
            onStatusChange={setSelectedStatus}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            selectedAuthor={selectedAuthor}
            onAuthorChange={setSelectedAuthor}
            categories={categories}
            tags={tags}
            authors={authors}
            onClearFilters={clearFilters}
            resultsCount={filteredContent.length}
          />

          {/* View Mode Toggle */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Content ({filteredContent.length})
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                Grid
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                List
              </Button>
            </div>
          </div>

          {/* Content Grid/List */}
          {filteredContent.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No content found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || selectedType !== "all" || selectedStatus !== "all" 
                    ? "Try adjusting your filters or search terms"
                    : "Get started by creating your first piece of content"
                  }
                </p>
                <Button onClick={() => navigate("/admin/content/new")} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Content
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className={
              viewMode === "grid" 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" 
                : "space-y-4"
            }>
              {filteredContent.map((item) => (
                <ContentCard
                  key={item.id}
                  content={item}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  compact={viewMode === "list"}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Analytics features coming soon. Track your content performance, engagement, and more.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}