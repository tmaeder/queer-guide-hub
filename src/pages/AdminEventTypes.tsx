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
        title: "Access Denied",
        description: "You need admin privileges to access this page.",
        variant: "destructive"
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
        title: "Error",
        description: "Failed to fetch event types",
        variant: "destructive"
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
          title: "Success",
          description: "Event type updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('event_types')
          .insert([formData]);
        
        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Event type created successfully"
        });
      }
      
      setIsDialogOpen(false);
      resetForm();
      fetchEventTypes();
    } catch (error: any) {
      console.error('Error saving event type:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save event type",
        variant: "destructive"
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
      const { error } = await supabase
        .from('event_types')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Event type deleted successfully"
      });
      
      fetchEventTypes();
    } catch (error: any) {
      console.error('Error deleting event type:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete event type",
        variant: "destructive"
      });
    }
  };

  const filteredEventTypes = eventTypes.filter(type => {
    const matchesSearch = type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (type.description?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' ||
                         (statusFilter === 'active' && type.is_active) ||
                         (statusFilter === 'inactive' && !type.is_active);
    return matchesSearch && matchesStatus;
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
          <h1 className="text-3xl font-bold">Event Types Management</h1>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Event Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingType ? 'Edit Event Type' : 'Create New Event Type'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Event type name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description of the event type"
                  rows={3}
                />
              </div>
              
              <div>
                <Label htmlFor="icon">Icon</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="Lucide icon name (e.g., Calendar)"
                />
              </div>
              
              <div>
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
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
                {editingType ? 'Update Event Type' : 'Create Event Type'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Search event types..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{eventTypes.length}</div>
            <div className="text-sm text-muted-foreground">Total Event Types</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{eventTypes.filter(type => type.is_active).length}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{eventTypes.filter(type => !type.is_active).length}</div>
            <div className="text-sm text-muted-foreground">Inactive</div>
          </CardContent>
        </Card>
      </div>

      {/* Event Types List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEventTypes.map((eventType) => (
          <Card key={eventType.id} className="relative">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded" 
                    style={{ backgroundColor: eventType.color }}
                  />
                  {eventType.name}
                </CardTitle>
                <Badge variant={eventType.is_active ? "default" : "secondary"}>
                  {eventType.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {eventType.description && (
                <p className="text-sm text-muted-foreground">
                  {eventType.description}
                </p>
              )}
              {eventType.icon && (
                <p className="text-sm">
                  <span className="font-medium">Icon:</span> {eventType.icon}
                </p>
              )}
              <p className="text-sm">
                <span className="font-medium">Sort Order:</span> {eventType.sort_order}
              </p>
              
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleEdit(eventType)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleDelete(eventType.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredEventTypes.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No event types found matching your criteria.</p>
        </div>
      )}
    </div>
  );
}