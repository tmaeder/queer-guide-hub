import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useContentManager } from "@/hooks/useContentManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  FileText,
  Tag,
  Folder,
  Settings,
  Grid3X3,
  List,
  Filter,
  Download,
  Upload,
  BarChart3,
  Clock,
  Users,
  Eye,
  Edit,
  Trash2,
  Globe,
  BookOpen,
  Newspaper,
  Info,
  Scale
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ContentCard } from "@/components/content/ContentCard";

export default function ContentManagementSystem() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { 
    content, 
    categories, 
    tags, 
    loading, 
    error,
    deleteContent,
    refresh
  } = useContentManager();
  const { toast } = useToast();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!rolesLoading && !canManageContent()) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access the content management system.",
        variant: "destructive"
      });
      navigate("/");
      return;
    }
  }, [user, rolesLoading, canManageContent, navigate, toast]);

  // Filter content
  const filteredContent = content.filter(item => {
    const matchesSearch = searchQuery === "" || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.excerpt && item.excerpt.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = selectedType === "all" || item.content_type === selectedType;
    const matchesStatus = selectedStatus === "all" || item.status === selectedStatus;
    const matchesCategory = selectedCategory === "all" || 
      (item.categories && item.categories.some(cat => cat.id === selectedCategory));

    return matchesSearch && matchesType && matchesStatus && matchesCategory;
  });

  // Content type counts
  const contentTypeCounts = {
    all: content.length,
    page: content.filter(c => c.content_type === 'page').length,
    blog_post: content.filter(c => c.content_type === 'blog_post').length,
    press_release: content.filter(c => c.content_type === 'press_release').length,
    legal_document: content.filter(c => c.content_type === 'legal_document').length,
    about_content: content.filter(c => c.content_type === 'about_content').length
  };

  // Status counts
  const statusCounts = {
    published: content.filter(c => c.status === 'published').length,
    draft: content.filter(c => c.status === 'draft').length,
    archived: content.filter(c => c.status === 'archived').length
  };

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
  };

  if (loading || rolesLoading) {
    return (
      <div className="w-full p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading Content Management System...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6">
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Error Loading Content</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => refresh()} variant="outline">
                Retry
              </Button>
              <Button onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canManageContent()) {
    return (
      <div className="w-full p-6">
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
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Management System</h1>
          <p className="text-muted-foreground">Create, manage, and publish your content efficiently</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <Settings className="h-4 w-4 mr-2" />
            Admin Dashboard
          </Button>
          <Button onClick={() => navigate("/admin/content/new")} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Create Content
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-6 w-6 text-primary mx-auto mb-2" />
            <div className="text-2xl font-bold">{contentTypeCounts.all}</div>
            <div className="text-xs text-muted-foreground">Total Content</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="h-6 w-6 text-green-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{statusCounts.published}</div>
            <div className="text-xs text-muted-foreground">Published</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Edit className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{statusCounts.draft}</div>
            <div className="text-xs text-muted-foreground">Drafts</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Folder className="h-6 w-6 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{categories.length}</div>
            <div className="text-xs text-muted-foreground">Categories</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Tag className="h-6 w-6 text-purple-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{tags.length}</div>
            <div className="text-xs text-muted-foreground">Tags</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-gray-500 mx-auto mb-2" />
            <div className="text-2xl font-bold">{statusCounts.archived}</div>
            <div className="text-xs text-muted-foreground">Archived</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Create Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Quick Create
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Button variant="outline" onClick={() => navigate("/admin/content/new?type=page")} className="flex flex-col h-16 gap-1">
              <Globe className="h-5 w-5" />
              <span className="text-xs">Page</span>
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/content/new?type=blog_post")} className="flex flex-col h-16 gap-1">
              <BookOpen className="h-5 w-5" />
              <span className="text-xs">Blog Post</span>
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/content/new?type=press_release")} className="flex flex-col h-16 gap-1">
              <Newspaper className="h-5 w-5" />
              <span className="text-xs">Press Release</span>
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/content/new?type=about_content")} className="flex flex-col h-16 gap-1">
              <Info className="h-5 w-5" />
              <span className="text-xs">About Content</span>
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/content/new?type=legal_document")} className="flex flex-col h-16 gap-1">
              <Scale className="h-5 w-5" />
              <span className="text-xs">Legal Doc</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search content..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-4">
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Content Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types ({contentTypeCounts.all})</SelectItem>
                    <SelectItem value="page">Pages ({contentTypeCounts.page})</SelectItem>
                    <SelectItem value="blog_post">Blog Posts ({contentTypeCounts.blog_post})</SelectItem>
                    <SelectItem value="press_release">Press Releases ({contentTypeCounts.press_release})</SelectItem>
                    <SelectItem value="about_content">About Content ({contentTypeCounts.about_content})</SelectItem>
                    <SelectItem value="legal_document">Legal Documents ({contentTypeCounts.legal_document})</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="published">Published ({statusCounts.published})</SelectItem>
                    <SelectItem value="draft">Draft ({statusCounts.draft})</SelectItem>
                    <SelectItem value="archived">Archived ({statusCounts.archived})</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Showing {filteredContent.length} of {content.length} items</span>
              {(searchQuery || selectedType !== "all" || selectedStatus !== "all" || selectedCategory !== "all") && (
                <Badge variant="secondary">Filters applied</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Grid/List */}
      {filteredContent.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No content found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedType !== "all" || selectedStatus !== "all" || selectedCategory !== "all"
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
    </div>
  );
}