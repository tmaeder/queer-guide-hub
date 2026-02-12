import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

type TargetGroup = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminTargetGroups() {
  const [targetGroups, setTargetGroups] = useState<TargetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TargetGroup | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "",
    color: "#6366f1",
    sort_order: 0,
    is_active: true
  });

  useEffect(() => {
    fetchTargetGroups();
  }, []);

  const fetchTargetGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('target_groups')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setTargetGroups(data || []);
    } catch (error) {
      console.error('Error fetching target groups:', error);
      toast({
        title: "Error",
        description: "Failed to fetch target groups",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingGroup) {
        const { error } = await supabase
          .from('target_groups')
          .update(formData)
          .eq('id', editingGroup.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Target group updated successfully",
        });
      } else {
        const { error } = await supabase
          .from('target_groups')
          .insert([formData]);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Target group created successfully",
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchTargetGroups();
    } catch (error) {
      console.error('Error saving target group:', error);
      toast({
        title: "Error",
        description: "Failed to save target group",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (group: TargetGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || "",
      icon: group.icon || "",
      color: group.color,
      sort_order: group.sort_order,
      is_active: group.is_active
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this target group?')) return;

    try {
      const { error } = await supabase
        .from('target_groups')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Target group deleted successfully",
      });
      fetchTargetGroups();
    } catch (error) {
      console.error('Error deleting target group:', error);
      toast({
        title: "Error",
        description: "Failed to delete target group",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      icon: "",
      color: "#6366f1",
      sort_order: 0,
      is_active: true
    });
    setEditingGroup(null);
  };

  const filteredGroups = targetGroups.filter(group => {
    const matchesSearch = group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         group.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesActive = !showActiveOnly || group.is_active;

    return matchesSearch && matchesActive;
  });

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
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Target Groups</Typography>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
              Add Target Group
            </Button>
          </DialogTrigger>
          <DialogContent style={{ maxWidth: 448 }}>
            <DialogHeader>
              <DialogTitle>
                {editingGroup ? "Edit Target Group" : "Add Target Group"}
              </DialogTitle>
            </DialogHeader>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                  placeholder="e.g., users, heart, rainbow"
                />
              </div>
              <div>
                <Label htmlFor="color">Color</Label>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    style={{ width: 64, height: 40 }}
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#6366f1"
                  />
                </Box>
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
                  {editingGroup ? "Update" : "Create"}
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
                  placeholder="Search target groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: 40 }}
                />
              </Box>
            </Box>
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

      {/* Target Groups Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
        {filteredGroups.map((group) => (
          <Card key={group.id} sx={{ opacity: !group.is_active ? 0.6 : 1 }}>
            <CardHeader sx={{ pb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CardTitle>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{ width: 16, height: 16, borderRadius: '50%', border: 1, borderColor: 'divider' }}
                      style={{ backgroundColor: group.color }}
                    />
                    <Typography variant="subtitle1">{group.name}</Typography>
                  </Box>
                </CardTitle>
              </Box>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {group.description && (
                  <Typography variant="body2" color="text.secondary">{group.description}</Typography>
                )}
                {group.icon && (
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 600 }}>Icon:</Box> {group.icon}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Order: {group.sort_order}</Typography>
                  <Badge variant={group.is_active ? "default" : "secondary"}>
                    {group.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 1 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(group)}
                  >
                    <Edit style={{ width: 16, height: 16 }} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(group.id)}
                  >
                    <Trash2 style={{ width: 16, height: 16 }} />
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {filteredGroups.length === 0 && (
        <Card>
          <CardContent sx={{ p: 6, textAlign: 'center' }}>
            <Typography color="text.secondary">No target groups found matching your criteria.</Typography>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
