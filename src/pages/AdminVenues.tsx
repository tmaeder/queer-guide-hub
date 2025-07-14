import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { useVenues } from "@/hooks/useVenues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Building,
  MapPin,
  Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminVenues() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { venues, loading, createVenue, updateVenue, deleteVenue, refetch } = useVenues();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filteredVenues, setFilteredVenues] = useState(venues);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    address: "",
    city: "",
    state: "",
    country: "US",
    postal_code: "",
    phone: "",
    email: "",
    website: "",
    instagram: "",
    price_range: "1",
    featured: false,
    verified: false,
    latitude: "",
    longitude: "",
    amenities: [] as string[],
    tags: [] as string[]
  });

  const venueCategories = [
    "restaurant", "bar", "cafe", "hotel", "club", "theater", 
    "museum", "gallery", "park", "gym", "spa", "shop", "other"
  ];

  const commonAmenities = [
    "WiFi", "Parking", "Wheelchair Accessible", "Pet Friendly", 
    "Outdoor Seating", "Live Music", "Air Conditioning", "Heating",
    "Private Dining", "Takeout", "Delivery", "Reservations"
  ];

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
    filterVenues();
  }, [venues, searchQuery, selectedCategory]);

  const filterVenues = () => {
    let filtered = venues;

    if (searchQuery) {
      filtered = filtered.filter(venue => 
        venue.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.city.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(venue => venue.category === selectedCategory);
    }

    setFilteredVenues(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const venueData = {
        ...formData,
        price_range: parseInt(formData.price_range),
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        created_by: user?.id
      };

      let error;
      if (editingVenue) {
        ({ error } = await updateVenue(editingVenue.id, venueData));
      } else {
        ({ error } = await createVenue(venueData));
      }
      
      if (error) throw new Error(error);

      toast({
        title: "Success",
        description: editingVenue ? "Venue updated successfully" : "Venue created successfully"
      });

      resetForm();
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: editingVenue ? "Failed to update venue" : "Failed to create venue",
        variant: "destructive"
      });
    }
  };

  const handleEditVenue = (venue: any) => {
    setEditingVenue(venue);
    setFormData({
      name: venue.name || "",
      description: venue.description || "",
      category: venue.category || "",
      address: venue.address || "",
      city: venue.city || "",
      state: venue.state || "",
      country: venue.country || "US",
      postal_code: venue.postal_code || "",
      phone: venue.phone || "",
      email: venue.email || "",
      website: venue.website || "",
      instagram: venue.instagram || "",
      price_range: venue.price_range?.toString() || "1",
      featured: venue.featured || false,
      verified: venue.verified || false,
      latitude: venue.latitude?.toString() || "",
      longitude: venue.longitude?.toString() || "",
      amenities: venue.amenities || [],
      tags: venue.tags || []
    });
    setIsCreateDialogOpen(true);
  };

  const handleDeleteVenue = async (venue: any) => {
    if (!confirm(`Are you sure you want to delete "${venue.name}"?`)) return;

    try {
      const { error } = await deleteVenue(venue.id);
      
      if (error) throw new Error(error);

      toast({
        title: "Success",
        description: "Venue deleted successfully"
      });

      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete venue",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      address: "",
      city: "",
      state: "",
      country: "US",
      postal_code: "",
      phone: "",
      email: "",
      website: "",
      instagram: "",
      price_range: "1",
      featured: false,
      verified: false,
      latitude: "",
      longitude: "",
      amenities: [],
      tags: []
    });
    setEditingVenue(null);
  };

  if (rolesLoading || loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Venues Management</h1>
            <p className="text-muted-foreground">Manage venues and locations</p>
          </div>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Venue
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingVenue ? 'Edit Venue' : 'Add New Venue'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Venue Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {venueCategories.map(category => (
                          <SelectItem key={category} value={category}>
                            {category.charAt(0).toUpperCase() + category.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>

              {/* Location */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Location</h3>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="postal_code">Postal Code</Label>
                    <Input
                      id="postal_code"
                      value={formData.postal_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, postal_code: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="instagram">Instagram</Label>
                    <Input
                      id="instagram"
                      value={formData.instagram}
                      onChange={(e) => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Settings</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="price_range">Price Range (1-4)</Label>
                    <Select
                      value={formData.price_range}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, price_range: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">$ - Budget</SelectItem>
                        <SelectItem value="2">$$ - Moderate</SelectItem>
                        <SelectItem value="3">$$$ - Expensive</SelectItem>
                        <SelectItem value="4">$$$$ - Very Expensive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="featured"
                      checked={formData.featured}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, featured: checked as boolean }))}
                    />
                    <Label htmlFor="featured">Featured Venue</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="verified"
                      checked={formData.verified}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, verified: checked as boolean }))}
                    />
                    <Label htmlFor="verified">Verified</Label>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full">
                {editingVenue ? 'Update Venue' : 'Add Venue'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search venues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {venueCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{venues.length}</p>
                <p className="text-sm text-muted-foreground">Total Venues</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-accent" />
              <div>
                <p className="text-2xl font-bold">{venues.filter(v => v.featured).length}</p>
                <p className="text-sm text-muted-foreground">Featured</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-accent" />
              <div>
                <p className="text-2xl font-bold">{venues.filter(v => v.verified).length}</p>
                <p className="text-sm text-muted-foreground">Verified</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{new Set(venues.map(v => v.city)).size}</p>
                <p className="text-sm text-muted-foreground">Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Venues List */}
      <Card>
        <CardHeader>
          <CardTitle>Venues ({filteredVenues.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredVenues.map((venue) => (
              <div key={venue.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{venue.name}</h3>
                    <Badge variant="outline">{venue.category}</Badge>
                    {venue.featured && (
                      <Badge className="bg-secondary/10 text-secondary">Featured</Badge>
                    )}
                    {venue.verified && (
                      <Badge className="bg-accent/10 text-accent">Verified</Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {venue.city}, {venue.state}
                    </div>
                    <div>
                      Price: {"$".repeat(venue.price_range || 1)}
                    </div>
                  </div>

                  {venue.description && (
                    <p className="text-sm text-muted-foreground">
                      {venue.description.slice(0, 100)}...
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditVenue(venue)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteVenue(venue)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {filteredVenues.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No venues found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}