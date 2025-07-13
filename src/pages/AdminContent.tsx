import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useContent } from "@/hooks/useContent";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Search, 
  Edit, 
  Eye, 
  Trash2, 
  Calendar,
  User,
  FileText,
  Archive,
  BarChart3
} from "lucide-react";
import { format } from "date-fns";

export default function AdminContent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    content, 
    categories, 
    tags, 
    loading, 
    fetchContent, 
    deleteContent 
  } = useContent();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    // Fetch all content including drafts for admin view
    fetchContent({ status: undefined });
  }, [user]);

  const filteredContent = content.filter(item => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedType === "all" || item.content_type === selectedType;
    const matchesStatus = selectedStatus === "all" || item.status === selectedStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this content?")) {
      try {
        await deleteContent(id);
      } catch (error) {
        console.error("Failed to delete content:", error);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-green-100 text-green-800";
      case "draft": return "bg-yellow-100 text-yellow-800";
      case "archived": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "blog_post": return "bg-blue-100 text-blue-800";
      case "page": return "bg-purple-100 text-purple-800";
      case "legal_document": return "bg-red-100 text-red-800";
      case "press_release": return "bg-green-100 text-green-800";
      case "about_content": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const stats = {
    total: content.length,
    published: content.filter(c => c.status === "published").length,
    drafts: content.filter(c => c.status === "draft").length,
    blog_posts: content.filter(c => c.content_type === "blog_post").length
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading content...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Content Management</h1>
          <p className="text-muted-foreground">Manage all your website content</p>
        </div>
        <Button onClick={() => navigate("/admin/content/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Content
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Content</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{stats.published}</p>
                <p className="text-sm text-muted-foreground">Published</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{stats.drafts}</p>
                <p className="text-sm text-muted-foreground">Drafts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{stats.blog_posts}</p>
                <p className="text-sm text-muted-foreground">Blog Posts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Types</option>
              <option value="blog_post">Blog Posts</option>
              <option value="page">Pages</option>
              <option value="legal_document">Legal Documents</option>
              <option value="press_release">Press Releases</option>
              <option value="about_content">About Content</option>
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Content List */}
      <Card>
        <CardHeader>
          <CardTitle>Content Items ({filteredContent.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredContent.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{item.title}</h3>
                    <Badge className={getStatusColor(item.status)}>
                      {item.status}
                    </Badge>
                    <Badge className={getTypeColor(item.content_type)}>
                      {item.content_type.replace("_", " ")}
                    </Badge>
                  </div>
                  
                  {item.excerpt && (
                    <p className="text-sm text-muted-foreground mb-2">{item.excerpt}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {item.published_at 
                        ? format(new Date(item.published_at), "MMM d, yyyy")
                        : format(new Date(item.created_at), "MMM d, yyyy")
                      }
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {item.author?.display_name || "Unknown"}
                    </div>
                    {item.categories && item.categories.length > 0 && (
                      <div className="flex gap-1">
                        {item.categories.map((category) => (
                          <span 
                            key={category.id}
                            className="text-xs px-2 py-1 rounded"
                            style={{ 
                              backgroundColor: category.color + "20",
                              color: category.color 
                            }}
                          >
                            {category.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/admin/content/${item.id}`)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {item.status === "published" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = item.content_type === "blog_post" 
                          ? `/blog/${item.slug}` 
                          : `/${item.slug}`;
                        window.open(url, "_blank");
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {filteredContent.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No content found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}