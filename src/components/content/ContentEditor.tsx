import { useState, useRef } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Save, 
  Eye, 
  Upload, 
  Link2, 
  Type, 
  Hash,
  Calendar,
  Globe,
  Settings,
  Image as ImageIcon
} from "lucide-react";
import { ContentType, ContentStatus, ContentCategory } from "@/hooks/useContent";

interface ContentEditorProps {
  formData: {
    title: string;
    slug: string;
    content_type: ContentType;
    status: ContentStatus;
    excerpt: string;
    content: string;
    meta_description: string;
    meta_keywords: string[];
    featured_image: string;
    categoryIds: string[];
  };
  onChange: (data: any) => void;
  onSave: () => void;
  onPreview?: () => void;
  categories: ContentCategory[];
  isLoading?: boolean;
  isEditing?: boolean;
}

export const ContentEditor = ({
  formData,
  onChange,
  onSave,
  onPreview,
  categories,
  isLoading = false,
  isEditing = false
}: ContentEditorProps) => {
  const [keywordInput, setKeywordInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Input sanitization helper
  const sanitizeInput = (input: string): string => {
    return DOMPurify.sanitize(input, { 
      ALLOWED_TAGS: [], 
      ALLOWED_ATTR: [] 
    }).trim();
  };

  const sanitizeHtmlContent = (content: string): string => {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target']
    });
  };

  const generateSlug = (title: string) => {
    const sanitizedTitle = sanitizeInput(title);
    return sanitizedTitle
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleTitleChange = (title: string) => {
    const sanitizedTitle = sanitizeInput(title);
    onChange({
      ...formData,
      title: sanitizedTitle,
      slug: !isEditing ? generateSlug(sanitizedTitle) : formData.slug
    });
  };

  const addKeyword = () => {
    const sanitizedKeyword = sanitizeInput(keywordInput);
    if (sanitizedKeyword && !formData.meta_keywords.includes(sanitizedKeyword)) {
      onChange({
        ...formData,
        meta_keywords: [...formData.meta_keywords, sanitizedKeyword]
      });
      setKeywordInput("");
    }
  };

  const removeKeyword = (keyword: string) => {
    onChange({
      ...formData,
      meta_keywords: formData.meta_keywords.filter(k => k !== keyword)
    });
  };

  const toggleCategory = (categoryId: string) => {
    const currentIds = formData.categoryIds || [];
    const newIds = currentIds.includes(categoryId)
      ? currentIds.filter(id => id !== categoryId)
      : [...currentIds, categoryId];
    onChange({ categoryIds: newIds });
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // This would typically upload to a storage service
      // For now, we'll just create a placeholder URL
      const imageUrl = URL.createObjectURL(file);
      onChange({ ...formData, featured_image: imageUrl });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Content Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Enter a compelling title..."
                  maxLength={200}
                  required
                />
            </div>

            <div>
              <Label htmlFor="slug">URL Slug *</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 bg-muted text-muted-foreground text-sm">
                  /
                </span>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => onChange({ ...formData, slug: sanitizeInput(e.target.value) })}
                  className=""
                  placeholder="url-friendly-slug"
                  maxLength={100}
                  pattern="^[a-z0-9-]+$"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                URL-friendly version of the title. Only lowercase letters, numbers, and hyphens.
              </p>
            </div>

            <div>
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                rows={3}
                value={formData.excerpt}
                onChange={(e) => onChange({ ...formData, excerpt: sanitizeInput(e.target.value) })}
                placeholder="A brief description that will appear in listings and search results..."
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ideal length: 150-160 characters for SEO
              </p>
            </div>

            <div>
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                rows={20}
                value={formData.content}
                onChange={(e) => onChange({ ...formData, content: sanitizeHtmlContent(e.target.value) })}
                placeholder="Write your content here... You can use HTML tags for formatting."
                className="font-mono text-sm"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports HTML formatting. Use semantic HTML tags for better SEO.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SEO & Media Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              SEO & Media
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="seo" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="seo">SEO Settings</TabsTrigger>
                <TabsTrigger value="media">Featured Media</TabsTrigger>
              </TabsList>
              
              <TabsContent value="seo" className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="meta_description">Meta Description</Label>
                  <Textarea
                    id="meta_description"
                    rows={3}
                    value={formData.meta_description}
                    onChange={(e) => onChange({ ...formData, meta_description: sanitizeInput(e.target.value) })}
                    placeholder="A concise description for search engines..."
                    maxLength={160}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.meta_description.length}/160 characters. This appears in search results.
                  </p>
                </div>

                <div>
                  <Label>Meta Keywords</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(sanitizeInput(e.target.value))}
                      placeholder="Add a keyword..."
                      maxLength={50}
                      onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    />
                    <Button type="button" onClick={addKeyword} variant="outline">
                      <Hash className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.meta_keywords.map((keyword, index) => (
                      <Badge 
                        key={index} 
                        variant="secondary" 
                        className="cursor-pointer"
                        onClick={() => removeKeyword(keyword)}
                      >
                        {keyword} ×
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="media" className="space-y-4 mt-4">
                <div>
                  <Label>Featured Image</Label>
                  <div className="mt-2">
                    {formData.featured_image && (
                      <div className="mb-4">
                        <img 
                          src={formData.featured_image} 
                          alt="Featured" 
                          className="w-full max-w-sm h-40 object-cover"
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={formData.featured_image}
                        onChange={(e) => onChange({ ...formData, featured_image: sanitizeInput(e.target.value) })}
                        placeholder="https://example.com/image.jpg"
                        pattern="^https?://.*\.(jpg|jpeg|png|gif|webp)$"
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Publish Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Publish Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Content Type</Label>
              <Select
                value={formData.content_type}
                onValueChange={(value: ContentType) => onChange({ ...formData, content_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blog_post">📝 Blog Post</SelectItem>
                  <SelectItem value="page">📄 Page</SelectItem>
                  <SelectItem value="legal_document">⚖️ Legal Document</SelectItem>
                  <SelectItem value="press_release">📰 Press Release</SelectItem>
                  <SelectItem value="about_content">ℹ️ About Content</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Publication Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: ContentStatus) => onChange({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">📝 Draft</SelectItem>
                  <SelectItem value="published">🌐 Published</SelectItem>
                  <SelectItem value="archived">📦 Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={onSave} disabled={isLoading} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
              {onPreview && formData.status === "published" && (
                <Button variant="outline" onClick={onPreview}>
                  <Eye className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={`category-${category.id}`}
                    checked={formData.categoryIds.includes(category.id)}
                    onCheckedChange={() => toggleCategory(category.id)}
                  />
                  <Label 
                    htmlFor={`category-${category.id}`} 
                    className="flex items-center gap-2 cursor-pointer flex-1"
                  >
                    <div 
                      className="w-3 h-3" 
                      style={{ backgroundColor: category.color || "#6366f1" }}
                    />
                    {category.name}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};