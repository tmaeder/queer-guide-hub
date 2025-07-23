import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { useCentralizedTags } from "@/hooks/useCentralizedTags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ArrowLeft,
  Tag,
  Database,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TagCategorizer } from "@/components/admin/TagCategorizer";
import { TagsCsvImport } from "@/components/admin/TagsCsvImport";
import { TagImageUpload } from "@/components/admin/TagImageUpload";
import { AlgoliaManager } from "@/components/admin/AlgoliaManager";

export default function AdminTags() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { 
    allTags: tags, 
    tagsByCategory: categories, 
    loading, 
    searchTags, 
    createTag, 
    updateTag, 
    deleteTag 
  } = useCentralizedTags();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filteredTags, setFilteredTags] = useState(tags);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<any>(null);
  const [bulkEditTags, setBulkEditTags] = useState<{[key: string]: string}>({});
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    image_url: "" as string | null
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!rolesLoading && !canManageContent()) {
      navigate("/");
      return;
    }
  }, [user, rolesLoading, canManageContent]);

  useEffect(() => {
    filterTags();
  }, [tags, searchQuery, selectedCategory]);

  const filterTags = async () => {
    if (searchQuery) {
      const results = await searchTags(searchQuery, selectedCategory !== "all" ? selectedCategory : undefined);
      setFilteredTags(results);
    } else {
      const filtered = selectedCategory === "all" 
        ? tags 
        : tags.filter(tag => tag.category === selectedCategory);
      setFilteredTags(filtered);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingTag) {
        await updateTag(editingTag.id, formData);
        toast({
          title: "Success",
          description: "Tag updated successfully"
        });
      } else {
        await createTag({
          ...formData,
          slug: formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        });
        toast({
          title: "Success", 
          description: "Tag created successfully"
        });
      }

      resetForm();
      setIsCreateDialogOpen(false);
      setEditingTag(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save tag",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (tag: any) => {
    setFormData({
      name: tag.name,
      category: tag.category,
      description: tag.description || "",
      image_url: tag.image_url || null
    });
    setEditingTag(tag);
    setIsCreateDialogOpen(true);
  };

  const handleDelete = async (tag: any) => {
    if (confirm(`Are you sure you want to delete the tag "${tag.name}"?`)) {
      try {
        await deleteTag(tag.id);
        toast({
          title: "Success",
          description: "Tag deleted successfully"
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete tag",
          variant: "destructive"
        });
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      description: "",
      image_url: null
    });
    setEditingTag(null);
  };

  const handleBulkEdit = async () => {
    const tagsWithoutDescriptions = tags.filter(tag => !tag.description || tag.description.trim() === '');
    const initialDescriptions: {[key: string]: string} = {};
    
    // Pre-populate with suggested descriptions based on tag names
    tagsWithoutDescriptions.forEach(tag => {
      initialDescriptions[tag.id] = getSuggestedDescription(tag.name, tag.category);
    });
    
    setBulkEditTags(initialDescriptions);
    setIsBulkEditOpen(true);
  };

  const getSuggestedDescription = (name: string, category: string): string => {
    const suggestions: {[key: string]: string} = {
      'Business': 'Business-related content, services, and commercial activities',
      'Community': 'Community events, groups, and local gatherings',
      'Events': 'Special events, celebrations, and organized activities',
      'Guide': 'Helpful guides, tutorials, and informational content',
      'LGBTQ+': 'LGBTQ+ community resources, events, and support',
      'News': 'Latest news, updates, and current events',
      'Safety': 'Safety information, tips, and emergency resources',
      'Technology': 'Technology-related content, digital tools, and innovations',
      'Tips': 'Helpful tips, advice, and recommendations',
      'Updates': 'System updates, announcements, and changes'
    };
    
    return suggestions[name] || `${name} related to ${category}`;
  };

  const saveBulkDescriptions = async () => {
    try {
      const updates = Object.entries(bulkEditTags).map(([tagId, description]) => {
        const tag = tags.find(t => t.id === tagId);
        return updateTag(tagId, { ...tag, description });
      });

      await Promise.all(updates);
      
      toast({
        title: "Success",
        description: `Updated descriptions for ${Object.keys(bulkEditTags).length} tags`
      });
      
      setIsBulkEditOpen(false);
      setBulkEditTags({});
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to update tag descriptions",
        variant: "destructive"
      });
    }
  };

  const uniqueCategories = Array.from(new Set(tags.map(tag => tag.category))).sort();

  if (rolesLoading || loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Tags Management</h1>
            <p className="text-muted-foreground">Create and manage content tags</p>
          </div>
        </div>
        <div className="flex gap-2">
          <TagsCsvImport onImportComplete={() => window.location.reload()} />
          <Button variant="outline" onClick={handleBulkEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Bulk Edit Descriptions
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                Create Tag
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTag ? "Edit Tag" : "Create New Tag"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Tag Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consent">Consent</SelectItem>
                    <SelectItem value="genders">Genders</SelectItem>
                    <SelectItem value="sexual-orientations">Sexual Orientations</SelectItem>
                    <SelectItem value="romantic-orientations">Romantic Orientations</SelectItem>
                    <SelectItem value="relationships">Relationships</SelectItem>
                    <SelectItem value="roles">Roles</SelectItem>
                    <SelectItem value="gay-culture">Gay Culture</SelectItem>
                    <SelectItem value="kink-activities">Kink Activities</SelectItem>
                    <SelectItem value="sexual-activities">Sexual Activities</SelectItem>
                    <SelectItem value="philia">Philia</SelectItem>
                    <SelectItem value="toys-equipment">Toys & Equipment</SelectItem>
                    <SelectItem value="play-spaces">Play Spaces</SelectItem>
                    <SelectItem value="events">Events</SelectItem>
                    <SelectItem value="holidays">Holidays</SelectItem>
                    <SelectItem value="sexual-health">Sexual Health</SelectItem>
                    <SelectItem value="mental-health">Mental Health</SelectItem>
                    <SelectItem value="scene-safety">Scene Safety</SelectItem>
                    <SelectItem value="safety-resources">Safety Resources</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <TagImageUpload 
                currentImageUrl={formData.image_url}
                onImageChange={(imageUrl) => setFormData(prev => ({ ...prev, image_url: imageUrl }))}
                tagName={formData.name}
              />
              <Button type="submit" className="w-full">
                {editingTag ? "Update Tag" : "Create Tag"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Bulk Edit Dialog */}
        <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Edit Tag Descriptions</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Add descriptions to tags that don't have them. Suggestions are pre-filled based on tag names.
              </p>
            </DialogHeader>
            <div className="space-y-4">
              {Object.entries(bulkEditTags).map(([tagId, description]) => {
                const tag = tags.find(t => t.id === tagId);
                if (!tag) return null;
                
                return (
                  <div key={tagId} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">{tag.name}</span>
                      <Badge variant="outline">{tag.category}</Badge>
                    </div>
                    <Textarea
                      value={description}
                      onChange={(e) => setBulkEditTags(prev => ({
                        ...prev,
                        [tagId]: e.target.value
                      }))}
                      placeholder="Enter description for this tag..."
                      rows={2}
                    />
                  </div>
                );
              })}
              
              {Object.keys(bulkEditTags).length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">All tags already have descriptions!</p>
                </div>
              )}
              
              {Object.keys(bulkEditTags).length > 0 && (
                <div className="flex gap-2 pt-4">
                  <Button onClick={saveBulkDescriptions} className="flex-1">
                    Save All Descriptions ({Object.keys(bulkEditTags).length} tags)
                  </Button>
                  <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Algolia Management */}
      <div className="mb-6">
        <AlgoliaManager />
      </div>

      {/* Tag Categorizer */}
      <div className="mb-6">
        <TagCategorizer />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{tags.length}</p>
                <p className="text-sm text-muted-foreground">Total Tags</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {categories.map((category) => (
          <Card key={category.category}>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <div 
                  className="w-5 h-5 rounded-full"
                  style={{ backgroundColor: category.tags[0]?.color || "#6366f1" }}
                />
                <div>
                  <p className="text-2xl font-bold">{category.count}</p>
                  <p className="text-sm text-muted-foreground">
                    {typeof category.category === 'string' 
                      ? category.category.charAt(0).toUpperCase() + category.category.slice(1)
                      : category.category
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tags List */}
      <Card>
        <CardHeader>
          <CardTitle>Tags ({filteredTags.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTags.map((tag) => (
              <div key={tag.id} className="border rounded-lg p-4 hover:bg-muted/50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{tag.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(tag)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(tag)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                {tag.image_url && (
                  <div className="mb-2">
                    <img 
                      src={tag.image_url} 
                      alt={tag.name} 
                      className="w-full h-20 object-cover rounded border"
                    />
                  </div>
                )}
                
                <Badge variant="outline" className="mb-2">
                  {tag.category}
                </Badge>
                
                {tag.description && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {tag.description}
                  </p>
                )}
                
                <div className="text-xs text-muted-foreground">
                  Used {tag.usage_count} times
                </div>
              </div>
            ))}
          </div>

          {filteredTags.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No tags found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}