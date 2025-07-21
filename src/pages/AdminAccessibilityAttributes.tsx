import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AccessibilityAttribute = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const categories = [
  { value: 'general', label: 'General' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'visual', label: 'Visual' },
  { value: 'hearing', label: 'Hearing' },
  { value: 'sensory', label: 'Sensory' }
];

export default function AdminAccessibilityAttributes() {
  const [attributes, setAttributes] = useState<AccessibilityAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAttribute, setEditingAttribute] = useState<AccessibilityAttribute | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "",
    category: "general",
    sort_order: 0,
    is_active: true
  });

  useEffect(() => {
    fetchAttributes();
  }, []);

  const fetchAttributes = async () => {
    try {
      const { data, error } = await supabase
        .from('accessibility_attributes')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setAttributes(data || []);
    } catch (error) {
      console.error('Error fetching accessibility attributes:', error);
      toast({
        title: "Error",
        description: "Failed to fetch accessibility attributes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingAttribute) {
        const { error } = await supabase
          .from('accessibility_attributes')
          .update(formData)
          .eq('id', editingAttribute.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Accessibility attribute updated successfully",
        });
      } else {
        const { error } = await supabase
          .from('accessibility_attributes')
          .insert([formData]);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Accessibility attribute created successfully",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchAttributes();
    } catch (error) {
      console.error('Error saving accessibility attribute:', error);
      toast({
        title: "Error",
        description: "Failed to save accessibility attribute",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (attribute: AccessibilityAttribute) => {
    setEditingAttribute(attribute);
    setFormData({
      name: attribute.name,
      description: attribute.description || "",
      icon: attribute.icon || "",
      category: attribute.category,
      sort_order: attribute.sort_order,
      is_active: attribute.is_active
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this accessibility attribute?')) return;

    try {
      const { error } = await supabase
        .from('accessibility_attributes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Accessibility attribute deleted successfully",
      });
      fetchAttributes();
    } catch (error) {
      console.error('Error deleting accessibility attribute:', error);
      toast({
        title: "Error",
        description: "Failed to delete accessibility attribute",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      icon: "",
      category: "general",
      sort_order: 0,
      is_active: true
    });
    setEditingAttribute(null);
  };

  const filteredAttributes = attributes.filter(attribute => {
    const matchesSearch = attribute.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         attribute.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || attribute.category === selectedCategory;
    const matchesActive = !showActiveOnly || attribute.is_active;
    
    return matchesSearch && matchesCategory && matchesActive;
  });

  const getCategoryBadgeColor = (category: string): "default" | "destructive" | "secondary" | "outline" => {
    const colors = {
      general: "default",
      mobility: "secondary", 
      visual: "outline",
      hearing: "destructive",
      sensory: "secondary"
    } as const;
    return colors[category as keyof typeof colors] || "default";
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Accessibility Attributes</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add Attribute
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingAttribute ? "Edit Accessibility Attribute" : "Add Accessibility Attribute"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="icon">Icon</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="e.g., wheelchair, car, audio"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingAttribute ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search attributes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center space-x-2">
              <Switch
                id="active-only"
                checked={showActiveOnly}
                onCheckedChange={setShowActiveOnly}
              />
              <Label htmlFor="active-only">Active only</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attributes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAttributes.map((attribute) => (
          <Card key={attribute.id} className={!attribute.is_active ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{attribute.name}</CardTitle>
                <Badge variant={getCategoryBadgeColor(attribute.category)}>
                  {attribute.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {attribute.description && (
                  <p className="text-sm text-muted-foreground">{attribute.description}</p>
                )}
                {attribute.icon && (
                  <p className="text-sm">
                    <span className="font-medium">Icon:</span> {attribute.icon}
                  </p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span>Order: {attribute.sort_order}</span>
                  <Badge variant={attribute.is_active ? "default" : "secondary"}>
                    {attribute.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(attribute)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(attribute.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAttributes.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No accessibility attributes found matching your criteria.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}