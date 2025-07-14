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
  Tag
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [editingTag, setEditingTag] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    description: "",
    color: "#6366f1"
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
        await createTag(formData);
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
      color: tag.color || "#6366f1"
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
      color: "#6366f1"
    });
    setEditingTag(null);
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
    <div className="container mx-auto p-6 max-w-7xl">
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
                    <SelectItem value="venue">Venue</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="marketplace">Marketplace</SelectItem>
                    <SelectItem value="content">Content</SelectItem>
                    <SelectItem value="general">General</SelectItem>
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
              <div>
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                />
              </div>
              <Button type="submit" className="w-full">
                {editingTag ? "Update Tag" : "Create Tag"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
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
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
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