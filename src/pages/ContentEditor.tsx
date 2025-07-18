import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useContent } from "@/hooks/useContent";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ContentType, ContentStatus } from "@/hooks/useContent";
import { ContentEditor as ContentEditorComponent } from "@/components/content/ContentEditor";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";

export default function ContentEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent } = useAdminRoles();
  const { 
    content, 
    categories, 
    createContent, 
    updateContent, 
    deleteContent 
  } = useContent();
  const { allTags } = useCentralizedTags();
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

    if (!canManageContent()) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to manage content.",
        variant: "destructive"
      });
      navigate("/admin/content");
      return;
    }

    if (id && id !== "new") {
      loadContent(id);
    }
  }, [id, user, canManageContent]);

  const loadContent = async (contentId: string) => {
    try {
      setIsLoading(true);
      let contentItem = content.find(c => c.id === contentId);
      
      if (!contentItem) {
        toast({
          title: "Content not found",
          description: "The content you're trying to edit could not be found.",
          variant: "destructive"
        });
        navigate("/admin/content");
        return;
      }
      
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
        tagIds: [] // Will be loaded from tag assignments
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load content",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
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

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading content editor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate("/admin/content")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Content
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {existingContent ? "Edit Content" : "Create Content"}
            </h1>
            <p className="text-muted-foreground">
              {existingContent ? `Editing: ${existingContent.title}` : "Create a new piece of content"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {existingContent && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Content Editor */}
      <ContentEditorComponent
        formData={formData}
        onChange={setFormData}
        onSave={handleSave}
        onPreview={formData.status === "published" ? handlePreview : undefined}
        categories={categories}
        
        isLoading={isLoading}
        isEditing={!!existingContent}
      />
    </div>
  );
}