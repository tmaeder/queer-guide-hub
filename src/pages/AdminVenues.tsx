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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { VenueImageUpload } from "@/components/venues/VenueImageUpload";
import { VenuesHeader } from "@/components/admin/venues/VenuesHeader";
import { VenuesFilters } from "@/components/admin/venues/VenuesFilters";
import { VenuesStats } from "@/components/admin/venues/VenuesStats";
import { VenuesList } from "@/components/admin/venues/VenuesList";
import { supabase } from "@/integrations/supabase/client";

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
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingTripAdvisor, setIsImportingTripAdvisor] = useState(false);
  const [isImportingTomTom, setIsImportingTomTom] = useState(false);
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
    tags: [] as string[],
    images: [] as string[]
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
        images: formData.images.length > 0 ? formData.images : null,
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
      tags: venue.tags || [],
      images: venue.images || []
    });
    setIsCreateDialogOpen(true);
  };

  const handleDeleteVenue = async (venue: any) => {
    console.log('Delete button clicked for venue:', venue);
    if (!confirm(`Are you sure you want to delete "${venue.name}"?`)) return;

    try {
      console.log('Attempting to delete venue with id:', venue.id);
      const { error } = await deleteVenue(venue.id);
      
      if (error) {
        console.error('Delete venue error:', error);
        throw new Error(error);
      }

      console.log('Venue deleted successfully');
      toast({
        title: "Success",
        description: "Venue deleted successfully"
      });

      refetch();
    } catch (error) {
      console.error('Delete venue catch block:', error);
      toast({
        title: "Error",
        description: "Failed to delete venue",
        variant: "destructive"
      });
    }
  };

  const handleFoursquareImport = async () => {
    setIsImporting(true);
    
    try {
      toast({
        title: "Import Started",
        description: "Foursquare venue import has been triggered. This may take a few minutes...",
      });

      const { data, error } = await supabase.functions.invoke('import-foursquare-venues', {
        body: { trigger: 'manual' }
      });

      if (error) throw error;

      toast({
        title: "Import Completed",
        description: `${data.message}. Page will refresh to show new venues.`,
      });

      // Refresh the venues list after import
      setTimeout(() => {
        refetch();
      }, 2000);
      
    } catch (error) {
      console.error('Foursquare import error:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import venues from Foursquare. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleTripAdvisorImport = async () => {
    setIsImportingTripAdvisor(true);
    
    try {
      toast({
        title: "Import Started",
        description: "TripAdvisor venue import has been triggered. This may take a few minutes...",
      });

      const { data, error } = await supabase.functions.invoke('import-tripadvisor-venues', {
        body: { trigger: 'manual' }
      });

      if (error) throw error;

      toast({
        title: "Import Completed",
        description: `${data.message}. Page will refresh to show new venues.`,
      });

      // Refresh the venues list after import
      setTimeout(() => {
        refetch();
      }, 2000);
      
    } catch (error) {
      console.error('TripAdvisor import error:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import venues from TripAdvisor. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsImportingTripAdvisor(false);
    }
  };

  const handleTomTomImport = async () => {
    setIsImportingTomTom(true);
    
    try {
      toast({
        title: "Import Started",
        description: "TomTom venue import has been triggered. This may take a few minutes...",
      });

      const { data, error } = await supabase.functions.invoke('import-tomtom-venues', {
        body: { trigger: 'manual' }
      });

      if (error) throw error;

      toast({
        title: "Import Completed",
        description: `${data.message}. Page will refresh to show new venues.`,
      });

      // Refresh the venues list
      setTimeout(() => {
        refetch();
      }, 2000);

    } catch (error) {
      console.error('TomTom import error:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import venues from TomTom. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsImportingTomTom(false);
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
      tags: [],
      images: []
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
    <div className="w-full space-y-8 p-6">
      {/* Header */}
      <VenuesHeader
        onBack={() => navigate("/admin")}
        onAddVenue={() => {
          resetForm();
          setIsCreateDialogOpen(true);
        }}
        onFoursquareImport={handleFoursquareImport}
        onTripAdvisorImport={handleTripAdvisorImport}
        onTomTomImport={handleTomTomImport}
        onImportComplete={refetch}
        isImporting={isImporting}
        isImportingTripAdvisor={isImportingTripAdvisor}
        isImportingTomTom={isImportingTomTom}
      />

      {/* Stats */}
      <VenuesStats venues={venues} />

      {/* Filters */}
      <VenuesFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={venueCategories}
        totalResults={filteredVenues.length}
      />

      {/* Venues List */}
      <VenuesList
        venues={filteredVenues}
        onEdit={handleEditVenue}
        onDelete={handleDeleteVenue}
      />

      {/* Add/Edit Venue Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
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

            {/* Venue Images */}
            <VenueImageUpload
              images={formData.images}
              onChange={(images) => setFormData(prev => ({ ...prev, images }))}
              maxImages={8}
            />

            <Button type="submit" className="w-full">
              {editingVenue ? 'Update Venue' : 'Add Venue'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}