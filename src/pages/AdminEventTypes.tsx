import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useToast } from '@/hooks/use-toast';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

interface EventType {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export default function AdminEventTypes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();

  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<EventType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '',
    color: '#6366f1',
    is_active: true,
    sort_order: 0,
  });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!isAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You need admin privileges to access this page.',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    fetchEventTypes();
  }, [user, isAdmin, navigate, toast]);

  const fetchEventTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('event_types')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setEventTypes(data || []);
    } catch (error) {
      console.error('Error fetching event types:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch event types',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingType) {
        const { error } = await supabase
          .from('event_types')
          .update(formData)
          .eq('id', editingType.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Event type updated successfully',
        });
      } else {
        const { error } = await supabase.from('event_types').insert([formData]);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Event type created successfully',
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchEventTypes();
    } catch (error: any) {
      console.error('Error saving event type:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save event type',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      icon: '',
      color: '#6366f1',
      is_active: true,
      sort_order: 0,
    });
    setEditingType(null);
  };

  const handleEdit = (eventType: EventType) => {
    setFormData({
      name: eventType.name,
      description: eventType.description || '',
      icon: eventType.icon || '',
      color: eventType.color,
      is_active: eventType.is_active,
      sort_order: eventType.sort_order,
    });
    setEditingType(eventType);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event type?')) return;

    try {
      const { error } = await supabase.from('event_types').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Event type deleted successfully',
      });

      fetchEventTypes();
    } catch (error: any) {
      console.error('Error deleting event type:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete event type',
        variant: 'destructive',
      });
    }
  };

  const filteredEventTypes = eventTypes.filter((type) => {
    const matchesSearch =
      type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      type.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && type.is_active) ||
      (statusFilter === 'inactive' && !type.is_active);
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
      >
        <Box
          sx={{
            height: 128,
            width: 128,
            bgcolor: 'primary.main',
            animation: 'spin 1s linear infinite',
          }}
        />
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
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Event Types Management
          </Typography>
        </Box>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
              Add Event Type
            </Button>
          </DialogTrigger>
          <DialogContent sx={{ maxWidth: 448 }}>
            <DialogHeader>
              <DialogTitle>{editingType ? 'Edit Event Type' : 'Create New Event Type'}</DialogTitle>
            </DialogHeader>
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <Box>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Event type name"
                  required
                />
              </Box>

              <Box>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description of the event type"
                  rows={3}
                />
              </Box>

              <Box>
                <Label htmlFor="icon">Icon</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="Lucide icon name (e.g., Calendar)"
                />
              </Box>

              <Box>
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </Box>

              <Box>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                  }
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
                {editingType ? 'Update Event Type' : 'Create Event Type'}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Input
          placeholder="Search event types..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: 384 }}
        />
        <Select
          value={statusFilter}
          onValueChange={(value: 'all' | 'active' | 'inactive') => setStatusFilter(value)}
        >
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
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
          gap: 2,
          mb: 3,
        }}
      >
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {eventTypes.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Event Types
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {eventTypes.filter((type) => type.is_active).length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Active
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {eventTypes.filter((type) => !type.is_active).length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inactive
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Event Types List */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' },
          gap: 2,
        }}
      >
        {filteredEventTypes.map((eventType) => (
          <Card key={eventType.id} sx={{ position: 'relative' }}>
            <CardHeader sx={{ pb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CardTitle>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{ width: 16, height: 16, borderRadius: 1 }}
                      style={{ backgroundColor: eventType.color }}
                    />
                    <Typography variant="subtitle1">{eventType.name}</Typography>
                  </Box>
                </CardTitle>
                <Badge variant={eventType.is_active ? 'default' : 'secondary'}>
                  {eventType.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </Box>
            </CardHeader>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {eventType.description && (
                  <Typography variant="body2" color="text.secondary">
                    {eventType.description}
                  </Typography>
                )}
                {eventType.icon && (
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      Icon:
                    </Box>{' '}
                    {eventType.icon}
                  </Typography>
                )}
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    Sort Order:
                  </Box>{' '}
                  {eventType.sort_order}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(eventType)}>
                    <Edit style={{ width: 16, height: 16 }} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(eventType.id)}>
                    <Trash2 style={{ width: 16, height: 16 }} />
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {filteredEventTypes.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            No event types found matching your criteria.
          </Typography>
        </Box>
      )}
    </Container>
  );
}
