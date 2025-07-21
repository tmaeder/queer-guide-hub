import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useToast } from '@/hooks/use-toast';

interface EventAmenity {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export default function AdminEventAmenities() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();
  
  const [amenities, setAmenities] = useState<EventAmenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAmenity, setEditingAmenity] = useState<EventAmenity | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '',
    category: '',
    is_active: true,
    sort_order: 0,
  });

  const categories = ['Technology', 'Accessibility', 'Comfort', 'Food & Beverage', 'Services'];

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "You need admin privileges to access this page.",
        variant: "destructive"
      });
      navigate('/');
      return;
    }
    
    fetchAmenities();
  }, [user, isAdmin, navigate, toast]);

  const fetchAmenities = async () => {
    try {
      const { data, error } = await supabase
        .from('event_amenities')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      setAmenities(data || []);
    } catch (error) {
      console.error('Error fetching event amenities:', error);
      toast({
        title: "Error",
        description: "Failed to fetch event amenities",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingAmenity) {
        const { error } = await supabase
          .from('event_amenities')
          .update(formData)
          .eq('id', editingAmenity.id);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Event amenity updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('event_amenities')
          .insert([formData]);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Event amenity created successfully"
        });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchAmenities();
    } catch (error: any) {
      console.error('Error saving event amenity:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save event amenity",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      icon: '',
      category: '',
      is_active: true,
      sort_order: 0,
    });
    setEditingAmenity(null);
  };

  const handleEdit = (amenity: EventAmenity) => {
    setFormData({
      name: amenity.name,
      description: amenity.description || '',
      icon: amenity.icon || '',
      category: amenity.category || '',
      is_active: amenity.is_active,
      sort_order: amenity.sort_order,
    });
    setEditingAmenity(amenity);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event amenity?')) return;
    
    try {
      const { error } = await supabase
        .from('event_amenities')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Event amenity deleted successfully"
      });
      
      fetchAmenities();
    } catch (error: any) {
      console.error('Error deleting event amenity:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete event amenity",
        variant: "destructive"
      });
    }
  };

  const filteredAmenities = amenities.filter(amenity => {
    const matchesSearch = amenity.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (amenity.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || amenity.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' ||
                         (statusFilter === 'active' && amenity.is_active) ||
                         (statusFilter === 'inactive' && !amenity.is_active);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-32 w-32 bg-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">Event Amenities Management</h1>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Event Amenity
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingAmenity ? 'Edit Event Amenity' : 'Create New Event Amenity'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Amenity name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description of the amenity"
                  rows={3}
                />
              </div>
              
              <div>
                <Label htmlFor="icon">Icon</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="Lucide icon name (e.g., Wifi)"
                />
              </div>
              
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
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
                  placeholder="0"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              
              <Button type="submit" className="w-full">
                {editingAmenity ? 'Update Event Amenity' : 'Create Event Amenity'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Search amenities..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value: 'all' | 'active' | 'inactive') => setStatusFilter(value)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{amenities.length}</div>
            <div className="text-sm text-muted-foreground">Total Amenities</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{amenities.filter(a => a.is_active).length}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{new Set(amenities.map(a => a.category)).size}</div>
            <div className="text-sm text-muted-foreground">Categories</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{amenities.filter(a => !a.is_active).length}</div>
            <div className="text-sm text-muted-foreground">Inactive</div>
          </CardContent>
        </Card>
      </div>

      {/* Amenities List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAmenities.map((amenity) => (
          <Card key={amenity.id} className="relative">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{amenity.name}</CardTitle>
                <Badge variant={amenity.is_active ? "default" : "secondary"}>
                  {amenity.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {amenity.description && (
                <p className="text-sm text-muted-foreground">
                  {amenity.description}
                </p>
              )}
              {amenity.category && (
                <Badge variant="outline">{amenity.category}</Badge>
              )}
              {amenity.icon && (
                <p className="text-sm">
                  <span className="font-medium">Icon:</span> {amenity.icon}
                </p>
              )}
              <p className="text-sm">
                <span className="font-medium">Sort Order:</span> {amenity.sort_order}
              </p>
              
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleEdit(amenity)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleDelete(amenity.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAmenities.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No amenities found matching your criteria.</p>
        </div>
      )}
    </div>
  );
}