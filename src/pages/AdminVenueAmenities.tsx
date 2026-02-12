import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, Save, X, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

type VenueAmenity = Tables<'venue_amenities'>;

interface AmenityFormData {
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

const defaultFormData: AmenityFormData = {
  name: '',
  slug: '',
  description: '',
  icon: '',
  category: 'general',
  sort_order: 0,
  is_active: true,
};

const amenityCategories = [
  'general',
  'accessibility',
  'comfort',
  'connectivity',
  'entertainment',
  'payment',
  'policies',
  'safety',
  'seating',
  'services'
];

export default function AdminVenueAmenities() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAmenity, setEditingAmenity] = useState<VenueAmenity | null>(null);
  const [formData, setFormData] = useState<AmenityFormData>(defaultFormData);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch venue amenities
  const { data: amenities = [], isLoading } = useQuery({
    queryKey: ['venue-amenities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_amenities')
        .select('*')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as VenueAmenity[];
    }
  });

  // Fetch linked venues for an amenity
  const fetchLinkedVenues = async (amenityName: string) => {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, city, country')
      .contains('amenities', [amenityName]);

    if (error) throw error;
    return data || [];
  };

  // Create amenity mutation
  const createAmenityMutation = useMutation({
    mutationFn: async (data: AmenityFormData) => {
      const { error } = await supabase
        .from('venue_amenities')
        .insert([data]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-amenities'] });
      setIsDialogOpen(false);
      setFormData(defaultFormData);
      toast.success('Amenity created successfully');
    },
    onError: (error: any) => {
      toast.error(`Error creating amenity: ${error.message}`);
    }
  });

  // Update amenity mutation
  const updateAmenityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AmenityFormData> }) => {
      const { error } = await supabase
        .from('venue_amenities')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-amenities'] });
      setEditingAmenity(null);
      setFormData(defaultFormData);
      setIsDialogOpen(false);
      toast.success('Amenity updated successfully');
    },
    onError: (error: any) => {
      toast.error(`Error updating amenity: ${error.message}`);
    }
  });

  // Delete amenity mutation
  const deleteAmenityMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('venue_amenities')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue-amenities'] });
      toast.success('Amenity deleted successfully');
    },
    onError: (error: any) => {
      toast.error(`Error deleting amenity: ${error.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingAmenity) {
      updateAmenityMutation.mutate({ id: editingAmenity.id, data: formData });
    } else {
      createAmenityMutation.mutate(formData);
    }
  };

  const handleEdit = (amenity: VenueAmenity) => {
    setEditingAmenity(amenity);
    setFormData({
      name: amenity.name,
      slug: amenity.slug,
      description: amenity.description || '',
      icon: amenity.icon || '',
      category: amenity.category || 'general',
      sort_order: amenity.sort_order || 0,
      is_active: amenity.is_active ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this amenity?')) {
      deleteAmenityMutation.mutate(id);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: prev.slug || generateSlug(name)
    }));
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingAmenity(null);
  };

  const filteredAmenities = filterCategory === 'all'
    ? amenities
    : amenities.filter(amenity => amenity.category === filterCategory);

  const toggleRowExpansion = (amenityId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(amenityId)) {
      newExpanded.delete(amenityId);
    } else {
      newExpanded.add(amenityId);
    }
    setExpandedRows(newExpanded);
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
          <Typography variant="subtitle1">Loading amenities...</Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <div>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Venue Amenities</Typography>
          <Typography color="text.secondary">Manage venue amenities and features</Typography>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} style={{ display: 'flex', gap: 8 }}>
              <Plus style={{ width: 16, height: 16 }} />
              Add Amenity
            </Button>
          </DialogTrigger>

          <DialogContent sx={{ maxWidth: 672 }}>
            <DialogHeader>
              <DialogTitle>
                {editingAmenity ? 'Edit Amenity' : 'Add New Amenity'}
              </DialogTitle>
            </DialogHeader>

            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                  />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="slug">Slug *</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    required
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="icon">Icon</Label>
                  <Input
                    id="icon"
                    value={formData.icon}
                    onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                    placeholder="Lucide icon name"
                  />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {amenityCategories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="sort_order">Sort Order</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <Label htmlFor="is_active">Active</Label>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  <X style={{ width: 16, height: 16, marginRight: 8 }} />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createAmenityMutation.isPending || updateAmenityMutation.isPending}
                >
                  <Save style={{ width: 16, height: 16, marginRight: 8 }} />
                  {editingAmenity ? 'Update' : 'Create'}
                </Button>
              </Box>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>

      {/* Filter */}
      <Box sx={{ mb: 3 }}>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger sx={{ width: 192 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {amenityCategories.map(category => (
              <SelectItem key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>

      <Card>
        <CardHeader>
          <CardTitle>
            All Venue Amenities ({amenities.length} total, {filteredAmenities.length} shown)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sort Order</TableHead>
                <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAmenities.map((amenity) => {
                const isExpanded = expandedRows.has(amenity.id);
                return (
                  <>
                    <TableRow key={amenity.id}>
                      <TableCell style={{ fontWeight: 600 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            component="button"
                            onClick={() => toggleRowExpansion(amenity.id)}
                            sx={{
                              p: 0.5,
                              borderRadius: 1,
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              '&:hover': { bgcolor: 'action.hover' },
                              transition: 'background-color 0.15s',
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown style={{ width: 16, height: 16 }} />
                            ) : (
                              <ChevronRight style={{ width: 16, height: 16 }} />
                            )}
                          </Box>
                          {amenity.name}
                        </Box>
                      </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {amenity.category?.charAt(0).toUpperCase() + amenity.category?.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {amenity.description}
                  </TableCell>
                  <TableCell>
                    <Badge variant={amenity.is_active ? "default" : "secondary"}>
                      {amenity.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{amenity.sort_order}</TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(amenity)}
                          >
                            <Edit style={{ width: 16, height: 16 }} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(amenity.id)}
                            style={{ color: 'var(--destructive)' }}
                          >
                            <Trash2 style={{ width: 16, height: 16 }} />
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row showing linked venues */}
                    {isExpanded && (
                      <LinkedVenuesRow amenityName={amenity.name} />
                    )}
                  </>
                );
              })}
              {filteredAmenities.length === 0 && amenities.length > 0 && (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', padding: '32px 0' }}>
                    <Typography color="text.secondary">
                      No amenities match the current filter. Total amenities: {amenities.length}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {filteredAmenities.length === 0 && amenities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', padding: '32px 0' }}>
                    <Typography color="text.secondary">
                      No amenities found. Create your first amenity to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Container>
  );
}

// Component to show linked venues
function LinkedVenuesRow({ amenityName }: { amenityName: string }) {
  const [venues, setVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const fetchVenues = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('venues')
          .select('id, name, city, country')
          .contains('amenities', [amenityName]);

        if (error) throw error;
        setVenues(data || []);
      } catch (error) {
        console.error('Error fetching linked venues:', error);
        setVenues([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVenues();
  }, [amenityName]);

  return (
    <TableRow sx={{ bgcolor: 'action.hover' }}>
      <TableCell colSpan={6} sx={{ py: 2 }}>
        <Box sx={{ ml: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <MapPin style={{ width: 16, height: 16 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Linked Venues ({venues.length})
            </Typography>
          </Box>
          {loading ? (
            <Typography variant="body2" color="text.secondary">Loading venues...</Typography>
          ) : venues.length > 0 ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
              {venues.map((venue) => (
                <Box
                  key={venue.id}
                  sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{venue.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {venue.city}, {venue.country}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No venues currently use this amenity
            </Typography>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
}
