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
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

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
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
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
    const matchesCategory = selectedCategory === "all" || attribute.category === selectedCategory;
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
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384 }}>
        Loading...
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Accessibility Attributes</Typography>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
              Add Attribute
            </Button>
          </DialogTrigger>
          <DialogContent sx={{ maxWidth: 448 }}>
            <DialogHeader>
              <DialogTitle>
                {editingAttribute ? "Edit Accessibility Attribute" : "Add Accessibility Attribute"}
              </DialogTitle>
            </DialogHeader>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </Box>
              <Box>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </Box>
              <Box>
                <Label htmlFor="icon">Icon</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="e.g., wheelchair, car, audio"
                />
              </Box>
              <Box>
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
              </Box>
              <Box>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingAttribute ? "Update" : "Create"}
                </Button>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 256 }}>
              <Box sx={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                <Input
                  placeholder="Search attributes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: 40 }}
                />
              </Box>
            </Box>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger style={{ width: 192 }}>
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                id="active-only"
                checked={showActiveOnly}
                onCheckedChange={setShowActiveOnly}
              />
              <Label htmlFor="active-only">Active only</Label>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Attributes Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
        {filteredAttributes.map((attribute) => (
          <Card key={attribute.id} sx={{ opacity: !attribute.is_active ? 0.6 : 1 }}>
            <CardHeader sx={{ pb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CardTitle>
                  <Typography variant="subtitle1">{attribute.name}</Typography>
                </CardTitle>
                <Badge variant={getCategoryBadgeColor(attribute.category)}>
                  {attribute.category}
                </Badge>
              </Box>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {attribute.description && (
                  <Typography variant="body2" color="text.secondary">{attribute.description}</Typography>
                )}
                {attribute.icon && (
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 600 }}>Icon:</Box> {attribute.icon}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Order: {attribute.sort_order}</Typography>
                  <Badge variant={attribute.is_active ? "default" : "secondary"}>
                    {attribute.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 1 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(attribute)}
                  >
                    <Edit style={{ width: 16, height: 16 }} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(attribute.id)}
                  >
                    <Trash2 style={{ width: 16, height: 16 }} />
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {filteredAttributes.length === 0 && (
        <Card>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <Typography color="text.secondary">No accessibility attributes found matching your criteria.</Typography>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
