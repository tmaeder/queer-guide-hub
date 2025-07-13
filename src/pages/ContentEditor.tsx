import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useContent } from "@/hooks/useContent";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, Eye, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ContentType, ContentStatus } from "@/hooks/useContent";

export default function ContentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    content, 
    categories, 
    tags, 
    createContent, 
    updateContent, 
    deleteContent,
    fetchContentBySlug 
  } = useContent();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    content_type: "blog_post" as ContentType,
    status: "draft" as ContentStatus,
    excerpt: "",
    content: "",
    meta_description: "",
    meta_keywords: [] as string[],
    featured_image: "",
    categoryIds: [] as string[],
    tagIds: [] as string[]
  });

  const [isLoading, setIsLoading] = useState(false);
  const [existingContent, setExistingContent] = useState<any>(null);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (id && id !== "new") {
      loadContent(id);
    }
  }, [id, user]);

  const loadContent = async (contentId: string) => {
    try {
      const contentItem = content.find(c => c.id === contentId);
      if (contentItem) {
        setExistingContent(contentItem);
        setFormData({
          title: contentItem.title,
          slug: contentItem.slug,
          content_type: contentItem.content_type as ContentType,
          status: contentItem.status as ContentStatus,
          excerpt: contentItem.excerpt || "",
          content: contentItem.content,
          meta_description: contentItem.meta_description || "",
          meta_keywords: contentItem.meta_keywords || [],
          featured_image: contentItem.featured_image || "",
          categoryIds: contentItem.categories?.map(c => c.id) || [],
          tagIds: contentItem.tags?.map(t => t.id) || []
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load content",
        variant: "destructive"
      });
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (existingContent) {
        await updateContent(existingContent.id, formData);
        toast({
          title: "Success",
          description: "Content updated successfully"
        });
      } else {
        await createContent(formData);
        toast({
          title: "Success",
          description: "Content created successfully"
        });
        navigate("/admin/content");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save content",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!existingContent) return;

    if (confirm("Are you sure you want to delete this content?")) {
      try {
        await deleteContent(existingContent.id);
        toast({
          title: "Success",
          description: "Content deleted successfully"
        });
        navigate("/admin/content");
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete content",
          variant: "destructive"
        });
      }
    }
  };

  const handlePreview = () => {
    if (formData.content_type === "blog_post") {
      window.open(`/blog/${formData.slug}`, "_blank");
    } else {
      window.open(`/${formData.slug}`, "_blank");
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate("/admin/content")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Content
          </Button>
          <h1 className="text-2xl font-bold">
            {existingContent ? "Edit Content" : "Create Content"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {existingContent && (
            <>
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      title,
                      slug: !existingContent ? generateSlug(title) : prev.slug
                    }));
                  }}
                  required
                />
              </div>

              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="excerpt">Excerpt</Label>
                <Textarea
                  id="excerpt"
                  rows={3}
                  value={formData.excerpt}
                  onChange={(e) => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                  placeholder="Brief description of the content..."
                />
              </div>

              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  rows={20}
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Write your content here..."
                  required
                />
                <p className="text-sm text-muted-foreground mt-1">
                  You can use HTML tags for formatting.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* SEO Settings */}
          <Card>
            <CardHeader>
              <CardTitle>SEO Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="meta_description">Meta Description</Label>
                <Textarea
                  id="meta_description"
                  rows={3}
                  value={formData.meta_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
                  placeholder="SEO description for search engines..."
                />
              </div>

              <div>
                <Label htmlFor="featured_image">Featured Image URL</Label>
                <Input
                  id="featured_image"
                  value={formData.featured_image}
                  onChange={(e) => setFormData(prev => ({ ...prev, featured_image: e.target.value }))}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Publish Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Publish Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="content_type">Content Type</Label>
                <Select
                  value={formData.content_type}
                  onValueChange={(value: ContentType) => setFormData(prev => ({ ...prev, content_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blog_post">Blog Post</SelectItem>
                    <SelectItem value="page">Page</SelectItem>
                    <SelectItem value="legal_document">Legal Document</SelectItem>
                    <SelectItem value="press_release">Press Release</SelectItem>
                    <SelectItem value="about_content">About Content</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: ContentStatus) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? "Saving..." : existingContent ? "Update" : "Create"}
              </Button>
            </CardContent>
          </Card>

          {/* Categories */}
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category.id}`}
                      checked={formData.categoryIds.includes(category.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData(prev => ({
                            ...prev,
                            categoryIds: [...prev.categoryIds, category.id]
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            categoryIds: prev.categoryIds.filter(id => id !== category.id)
                          }));
                        }
                      }}
                    />
                    <Label htmlFor={`category-${category.id}`} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: category.color || "#6366f1" }}
                      />
                      {category.name}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={formData.tagIds.includes(tag.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      if (formData.tagIds.includes(tag.id)) {
                        setFormData(prev => ({
                          ...prev,
                          tagIds: prev.tagIds.filter(id => id !== tag.id)
                        }));
                      } else {
                        setFormData(prev => ({
                          ...prev,
                          tagIds: [...prev.tagIds, tag.id]
                        }));
                      }
                    }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}