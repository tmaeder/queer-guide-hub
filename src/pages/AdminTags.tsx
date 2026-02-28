import React, { useState, useEffect } from "react";
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
import { ExportExcelButton } from "@/components/admin/ExportExcelButton";
import { exportToExcel, fetchAllRows, formatDateTime, generateFilename, type ExportColumnDef } from "@/utils/excelExport";
import { TagCategorizer } from "@/components/admin/TagCategorizer";
import { TagsCsvImport } from "@/components/admin/TagsCsvImport";
import { TagImageUpload } from "@/components/admin/TagImageUpload";
import BulkCreateAITags from "@/components/admin/BulkCreateAITags";
import BatchAutoTagDialog from "@/components/admin/BatchAutoTagDialog";
import BatchGeoLinkDialog from "@/components/admin/BatchGeoLinkDialog";
import BulkEnrichDialog from "@/components/admin/BulkEnrichDialog";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';


export default function AdminTags() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const {
    allTags: tags,
    tagsByCategory: categories,
    categoriesTree,
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
        : tags.filter(tag => {
            if (tag.categories && tag.categories.length > 0) {
              return tag.categories.some(c => c.name === selectedCategory);
            }
            return tag.category === selectedCategory;
          });
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
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography>Loading...</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back to Dashboard
          </Button>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>Tags Management</Typography>
            <Typography variant="body2" color="text.secondary">Create and manage content tags</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <TagsCsvImport onImportComplete={() => window.location.reload()} />
          <ExportExcelButton onExport={async () => {
            const columns: ExportColumnDef<any>[] = [
              { header: 'Name', accessor: r => r.name },
              { header: 'Slug', accessor: r => r.slug },
              { header: 'Category', accessor: r => r.category },
              { header: 'Status', accessor: r => r.status },
              { header: 'Description', accessor: r => r.description },
              { header: 'Usage Count', accessor: r => r.usage_count },
              { header: 'Deprecation Reason', accessor: r => r.deprecation_reason },
              { header: 'Created At', accessor: r => formatDateTime(r.created_at) },
            ];
            const allData = await fetchAllRows('unified_tags', '*', { column: 'name', ascending: true });
            await exportToExcel(allData, columns, generateFilename('tags'));
          }} />
          <BulkCreateAITags onComplete={() => window.location.reload()} />
          <BatchAutoTagDialog onComplete={() => window.location.reload()} />
          <BatchGeoLinkDialog onComplete={() => window.location.reload()} />
          <BulkEnrichDialog onComplete={() => window.location.reload()} />
          <Button variant="outline" onClick={handleBulkEdit}>
            <Edit style={{ height: 16, width: 16, marginRight: 8 }} />
            Bulk Edit Descriptions
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
                Create Tag
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTag ? "Edit Tag" : "Create New Tag"}</DialogTitle>
            </DialogHeader>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Label htmlFor="name">Tag Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </Box>
              <Box>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesTree.map(cat => (
                      <React.Fragment key={cat.id}>
                        <SelectItem value={cat.name}>
                          {cat.name}
                        </SelectItem>
                        {cat.children.map(child => (
                          <SelectItem key={child.id} value={child.name}>
                            <span style={{ paddingLeft: 16, fontSize: '0.9em' }}>
                              ↳ {child.name}
                            </span>
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </Box>
              <Box>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </Box>
              <TagImageUpload
                currentImageUrl={formData.image_url}
                onImageChange={(imageUrl) => setFormData(prev => ({ ...prev, image_url: imageUrl }))}
                tagName={formData.name}
              />
              <Button type="submit" sx={{ width: '100%' }}>
                {editingTag ? "Update Tag" : "Create Tag"}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>

        {/* Bulk Edit Dialog */}
        <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
          <DialogContent sx={{ maxWidth: 896, maxHeight: '80vh', overflowY: 'auto' }}>
            <DialogHeader>
              <DialogTitle>Bulk Edit Tag Descriptions</DialogTitle>
              <Typography variant="body2" color="text.secondary">
                Add descriptions to tags that don't have them. Suggestions are pre-filled based on tag names.
              </Typography>
            </DialogHeader>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Object.entries(bulkEditTags).map(([tagId, description]) => {
                const tag = tags.find(t => t.id === tagId);
                if (!tag) return null;

                return (
                  <Box key={tagId} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Box component="span" sx={{ fontWeight: 500 }}>{tag.name}</Box>
                      <Badge variant="outline">{tag.category}</Badge>
                    </Box>
                    <Textarea
                      value={description}
                      onChange={(e) => setBulkEditTags(prev => ({
                        ...prev,
                        [tagId]: e.target.value
                      }))}
                      placeholder="Enter description for this tag..."
                      rows={2}
                    />
                  </Box>
                );
              })}

              {Object.keys(bulkEditTags).length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">All tags already have descriptions!</Typography>
                </Box>
              )}

              {Object.keys(bulkEditTags).length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, pt: 2 }}>
                  <Button onClick={saveBulkDescriptions} sx={{ flex: 1 }}>
                    Save All Descriptions ({Object.keys(bulkEditTags).length} tags)
                  </Button>
                  <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
                    Cancel
                  </Button>
                </Box>
              )}
            </Box>
          </DialogContent>
        </Dialog>
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ position: 'relative' }}>
                  <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                  <Input
                    placeholder="Search tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: 40 }}
                  />
                </Box>
              </Box>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger style={{ width: 220 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoriesTree.map(cat => (
                    <React.Fragment key={cat.id}>
                      <SelectItem value={cat.name}>
                        {cat.name}
                      </SelectItem>
                      {cat.children.map(child => (
                        <SelectItem key={child.id} value={child.name}>
                          <span style={{ paddingLeft: 12, fontSize: '0.9em', opacity: 0.85 }}>
                            {child.name}
                          </span>
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          </CardContent>
        </Card>
      </Box>


      {/* Tag Categorizer */}
      <Box sx={{ mb: 3 }}>
        <TagCategorizer />
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3, mb: 4 }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tag style={{ width: 20, height: 20, color: 'var(--primary)' }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{tags.length}</Typography>
                <Typography variant="body2" color="text.secondary">Total Tags</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        {categories.map((category) => (
          <Card key={category.category}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{ width: 20, height: 20, borderRadius: '50%' }}
                  style={{ backgroundColor: category.tags[0]?.color || "#6366f1" }}
                />
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{category.count}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {typeof category.category === 'string'
                      ? category.category.charAt(0).toUpperCase() + category.category.slice(1)
                      : category.category
                    }
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Tags List */}
      <Card>
        <CardHeader>
          <CardTitle>Tags ({filteredTags.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
            {filteredTags.map((tag) => (
              <Box key={tag.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{tag.name}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(tag)}
                    >
                      <Edit style={{ height: 12, width: 12 }} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(tag)}
                    >
                      <Trash2 style={{ height: 12, width: 12 }} />
                    </Button>
                  </Box>
                </Box>

                {tag.image_url && (
                  <Box sx={{ mb: 1 }}>
                    <Box
                      component="img"
                      src={tag.image_url}
                      alt={tag.name}
                      sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider' }}
                    />
                  </Box>
                )}

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {tag.categories && tag.categories.length > 0 ? (
                    tag.categories.map((c: any) => (
                      <Badge key={c.id} variant={c.is_primary ? "default" : "outline"}>
                        {c.parent_name ? `${c.parent_name} › ` : ''}{c.name}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline">{tag.category}</Badge>
                  )}
                </Box>

                {tag.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {tag.description}
                  </Typography>
                )}

                <Typography variant="caption" color="text.secondary">
                  Used {tag.usage_count} times
                </Typography>
              </Box>
            ))}
          </Box>

          {filteredTags.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">No tags found</Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}