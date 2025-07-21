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
    return <div className="flex items-center justify-center h-96">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Target Groups</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Add Target Group
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingGroup ? "Edit Target Group" : "Add Target Group"}
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
                  placeholder="e.g., users, heart, rainbow"
                />
              </div>
              <div>
                <Label htmlFor="color">Color</Label>
                <div className="flex space-x-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-16 h-10"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#6366f1"
                  />
                </div>
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
                  {editingGroup ? "Update" : "Create"}
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
                  placeholder="Search target groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
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

      {/* Target Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredGroups.map((group) => (
          <Card key={group.id} className={!group.is_active ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center space-x-2">
                  <div 
                    className="w-4 h-4 rounded-full border" 
                    style={{ backgroundColor: group.color }}
                  />
                  <span>{group.name}</span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {group.description && (
                  <p className="text-sm text-muted-foreground">{group.description}</p>
                )}
                {group.icon && (
                  <p className="text-sm">
                    <span className="font-medium">Icon:</span> {group.icon}
                  </p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span>Order: {group.sort_order}</span>
                  <Badge variant={group.is_active ? "default" : "secondary"}>
                    {group.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(group)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(group.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredGroups.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No target groups found matching your criteria.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}