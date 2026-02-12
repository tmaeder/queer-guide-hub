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
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Box sx={{ height: 128, width: 128, bgcolor: 'primary.main', animation: 'spin 1s linear infinite' }} />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outline" onClick={() => navigate('/admin')}>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Dashboard
          </Button>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Event Amenities Management</Typography>
        </Box>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
              Add Event Amenity
            </Button>
          </DialogTrigger>
          <DialogContent sx={{ maxWidth: 448 }}>
            <DialogHeader>
              <DialogTitle>
                {editingAmenity ? 'Edit Event Amenity' : 'Create New Event Amenity'}
              </DialogTitle>
            </DialogHeader>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Amenity name"
                  required
                />
              </Box>

              <Box>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description of the amenity"
                  rows={3}
                />
              </Box>

              <Box>
                <Label htmlFor="icon">Icon</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="Lucide icon name (e.g., Wifi)"
                />
              </Box>

              <Box>
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
              </Box>

              <Box>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <Label htmlFor="is_active">Active</Label>
              </Box>

              <Button type="submit" style={{ width: '100%' }}>
                {editingAmenity ? 'Update Event Amenity' : 'Create Event Amenity'}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Input
          placeholder="Search amenities..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: 384 }}
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger style={{ width: 192 }}>
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
          <SelectTrigger style={{ width: 160 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{amenities.length}</Typography>
            <Typography variant="body2" color="text.secondary">Total Amenities</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{amenities.filter(a => a.is_active).length}</Typography>
            <Typography variant="body2" color="text.secondary">Active</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{new Set(amenities.map(a => a.category)).size}</Typography>
            <Typography variant="body2" color="text.secondary">Categories</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{amenities.filter(a => !a.is_active).length}</Typography>
            <Typography variant="body2" color="text.secondary">Inactive</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Amenities List */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
        {filteredAmenities.map((amenity) => (
          <Card key={amenity.id} sx={{ position: 'relative' }}>
            <CardHeader sx={{ pb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CardTitle>
                  <Typography variant="subtitle1">{amenity.name}</Typography>
                </CardTitle>
                <Badge variant={amenity.is_active ? "default" : "secondary"}>
                  {amenity.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </Box>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {amenity.description && (
                  <Typography variant="body2" color="text.secondary">
                    {amenity.description}
                  </Typography>
                )}
                {amenity.category && (
                  <Badge variant="outline">{amenity.category}</Badge>
                )}
                {amenity.icon && (
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 600 }}>Icon:</Box> {amenity.icon}
                  </Typography>
                )}
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 600 }}>Sort Order:</Box> {amenity.sort_order}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(amenity)}
                  >
                    <Edit style={{ width: 16, height: 16 }} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(amenity.id)}
                  >
                    <Trash2 style={{ width: 16, height: 16 }} />
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {filteredAmenities.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">No amenities found matching your criteria.</Typography>
        </Box>
      )}
    </Container>
  );
}
