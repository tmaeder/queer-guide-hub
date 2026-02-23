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
import { VenueEnrichmentPreview } from "@/components/admin/venues/VenueEnrichmentPreview";
import { LocationAutocomplete, type AddressComponents } from "@/components/ui/location-autocomplete";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, fetchAllRows, formatDateTime, formatArray, formatBoolean, generateFilename, type ExportColumnDef } from "@/utils/excelExport";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

export default function AdminVenues() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { venues, loading, createVenue, updateVenue, deleteVenue, refetch } = useVenues();
  const { toast } = useToast();
  const { resolveAddress, resolving: resolvingAddress } = useAddressResolver();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCity, setSelectedCity] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [filteredVenues, setFilteredVenues] = useState(venues);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingTripAdvisor, setIsImportingTripAdvisor] = useState(false);
  const [isImportingTomTom, setIsImportingTomTom] = useState(false);
  const [isImportingGooglePlaces, setIsImportingGooglePlaces] = useState(false);
  const [isEnrichingVenue, setIsEnrichingVenue] = useState(false);
  const [enrichmentResults, setEnrichmentResults] = useState<any[]>([]);
  const [showEnrichmentPreview, setShowEnrichmentPreview] = useState(false);
  const [enrichmentVenueName, setEnrichmentVenueName] = useState("");
  const [isAddressValidated, setIsAddressValidated] = useState(false);
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
  }, [venues, searchQuery, selectedCategory, selectedCity, selectedTags, selectedAmenities]);

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

    if (selectedCity !== "all") {
      filtered = filtered.filter(venue => venue.city === selectedCity);
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter(venue =>
        venue.tags && selectedTags.some(tag => venue.tags?.includes(tag))
      );
    }

    if (selectedAmenities.length > 0) {
      filtered = filtered.filter(venue =>
        venue.amenities && selectedAmenities.some(amenity => venue.amenities?.includes(amenity))
      );
    }

    setFilteredVenues(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate required fields
      if (!formData.name.trim()) {
        toast({
          title: "Validation Error",
          description: "Venue name is required",
          variant: "destructive"
        });
        return;
      }

      const venueData: Record<string, any> = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        country: formData.country.trim() || null,
        postal_code: formData.postal_code.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        website: formData.website.trim() || null,
        instagram: formData.instagram.trim() || null,
        category: formData.category || null,
        tags: formData.tags.length > 0 ? formData.tags : [],
        amenities: formData.amenities.length > 0 ? formData.amenities : [],
        price_range: formData.price_range ? parseInt(formData.price_range) : null,
        latitude: formData.latitude && formData.latitude.trim() ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude && formData.longitude.trim() ? parseFloat(formData.longitude) : null,
        images: formData.images.length > 0 ? formData.images : [],
        featured: formData.featured,
        verified: formData.verified,
        created_by: user?.id
      };
      // Include resolved FK IDs if available
      if ((formData as any).city_id) venueData.city_id = (formData as any).city_id;
      if ((formData as any).country_id) venueData.country_id = (formData as any).country_id;

      let result;
      if (editingVenue) {
        result = await updateVenue(editingVenue.id, venueData);
      } else {
        result = await createVenue(venueData);
      }

      if (result.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Success",
        description: editingVenue ? "Venue updated successfully" : "Venue created successfully"
      });

      resetForm();
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error) {
      console.error('Venue submission error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : (editingVenue ? "Failed to update venue" : "Failed to create venue"),
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

  const handleFoursquareImport = async (isReimport = false) => {
    setIsImporting(true);

    try {
      toast({
        title: isReimport ? "Re-import Started" : "Import Started",
        description: `Foursquare venue ${isReimport ? 're-import' : 'import'} has been triggered. This may take a few minutes...`,
      });

      const { data, error } = await supabase.functions.invoke('import-foursquare-venues', {
        body: { trigger: 'manual', isReimport }
      });

      if (error) throw error;

      toast({
        title: isReimport ? "Re-import Completed" : "Import Completed",
        description: `${data.message}. Page will refresh to show updated venues.`,
      });

      // Refresh the venues list after import
      setTimeout(() => {
        refetch();
      }, 2000);

    } catch (error) {
      console.error('Foursquare import error:', error);
      toast({
        title: isReimport ? "Re-import Failed" : "Import Failed",
        description: `Failed to ${isReimport ? 're-import' : 'import'} venues from Foursquare. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleTripAdvisorImport = async (isReimport = false) => {
    setIsImportingTripAdvisor(true);

    try {
      toast({
        title: isReimport ? "Re-import Started" : "Import Started",
        description: `TripAdvisor venue ${isReimport ? 're-import' : 'import'} has been triggered. This may take a few minutes...`,
      });

      const { data, error } = await supabase.functions.invoke('import-tripadvisor-venues', {
        body: { trigger: 'manual', isReimport }
      });

      if (error) throw error;

      toast({
        title: isReimport ? "Re-import Completed" : "Import Completed",
        description: `${data.message}. Page will refresh to show updated venues.`,
      });

      // Refresh the venues list after import
      setTimeout(() => {
        refetch();
      }, 2000);

    } catch (error) {
      console.error('TripAdvisor import error:', error);
      toast({
        title: isReimport ? "Re-import Failed" : "Import Failed",
        description: `Failed to ${isReimport ? 're-import' : 'import'} venues from TripAdvisor. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsImportingTripAdvisor(false);
    }
  };

  const handleTomTomImport = async (isReimport = false) => {
    setIsImportingTomTom(true);

    try {
      toast({
        title: isReimport ? "Re-import Started" : "Import Started",
        description: `TomTom venue ${isReimport ? 're-import' : 'import'} has been triggered. This may take a few minutes...`,
      });

      const { data, error } = await supabase.functions.invoke('import-tomtom-venues', {
        body: { trigger: 'manual', isReimport }
      });

      if (error) throw error;

      toast({
        title: isReimport ? "Re-import Completed" : "Import Completed",
        description: `${data.message}. Page will refresh to show updated venues.`,
      });

      // Refresh the venues list
      setTimeout(() => {
        refetch();
      }, 2000);

    } catch (error) {
      console.error('TomTom import error:', error);
      toast({
        title: isReimport ? "Re-import Failed" : "Import Failed",
        description: `Failed to ${isReimport ? 're-import' : 'import'} venues from TomTom. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsImportingTomTom(false);
    }
  };

  const handleGooglePlacesImport = async () => {
    setIsImportingGooglePlaces(true);
    try {
      toast({
        title: "Import Started",
        description: "Google Places venue import has been triggered. This may take a few minutes...",
      });

      const { data, error } = await supabase.functions.invoke('import-google-places-venues');

      if (error) {
        console.error('Google Places import error:', error);
        toast({
          title: "Import Failed",
          description: "Failed to import venues from Google Places. Please try again.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Import Completed",
          description: `${data.message}. Page will refresh to show updated venues.`,
        });

        // Refresh the venues list after import
        setTimeout(() => {
          refetch();
        }, 2000);
      }
    } catch (error) {
      console.error('Google Places import error:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import venues from Google Places. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsImportingGooglePlaces(false);
    }
  };

  const handleAddressComponentsAndResolve = async (
    components: AddressComponents | undefined,
    coordinates?: { lat: number; lng: number }
  ) => {
    if (!components) return;

    // Fill text fields from structured components
    setFormData(prev => ({
      ...prev,
      city: components.city || prev.city,
      state: components.state || prev.state,
      country: components.country || prev.country,
      postal_code: components.postcode || prev.postal_code,
    }));

    // Resolve to FK IDs
    if (components.country) {
      const resolved = await resolveAddress(
        components.city,
        components.country,
        coordinates?.lat,
        coordinates?.lng,
      );
      if (resolved) {
        setFormData(prev => ({
          ...prev,
          ...(resolved.city_id ? { city_id: resolved.city_id } : {}),
          ...(resolved.country_id ? { country_id: resolved.country_id } : {}),
          // Use canonical names from DB if available
          ...(resolved.city_name ? { city: resolved.city_name } : {}),
          ...(resolved.country_name ? { country: resolved.country_name } : {}),
        }));
        if (resolved.created) {
          toast({
            title: "New City Created",
            description: `"${resolved.city_name}" was added to the database.`,
          });
        }
      }
    }
  };

  const handleEnrichVenue = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a venue name first",
        variant: "destructive",
      });
      return;
    }

    setIsEnrichingVenue(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-venue', {
        body: {
          venueName: formData.name,
          currentData: formData
        }
      });

      if (error) throw error;

      if (data?.individualResults && data.individualResults.length > 0) {
        setEnrichmentResults(data.individualResults);
        setEnrichmentVenueName(formData.name);
        setShowEnrichmentPreview(true);
      } else {
        toast({
          title: "No Results",
          description: "No venue data found from external sources",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Venue enrichment error:', error);
      toast({
        title: "Error",
        description: "Failed to enrich venue data",
        variant: "destructive",
      });
    } finally {
      setIsEnrichingVenue(false);
    }
  };

  const handleSelectEnrichmentResult = (selectedData: any) => {
    // Merge selected data with current venue data, only filling empty fields
    const updatedVenue = { ...formData };

    Object.entries(selectedData).forEach(([key, value]) => {
      if (value && (!updatedVenue[key as keyof typeof updatedVenue] || updatedVenue[key as keyof typeof updatedVenue] === '')) {
        (updatedVenue as any)[key] = value;
      }
    });

    setFormData(updatedVenue);
    setShowEnrichmentPreview(false);

    toast({
      title: "Success",
      description: "Venue data has been enriched with selected information",
    });
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
    setIsAddressValidated(false);
  };

  const handleExportExcel = async () => {
    const columns: ExportColumnDef<any>[] = [
      { header: 'Name', accessor: r => r.name },
      { header: 'Category', accessor: r => r.category },
      { header: 'Address', accessor: r => r.address },
      { header: 'City', accessor: r => r.city },
      { header: 'State', accessor: r => r.state },
      { header: 'Country', accessor: r => r.country },
      { header: 'Phone', accessor: r => r.phone },
      { header: 'Email', accessor: r => r.email },
      { header: 'Website', accessor: r => r.website },
      { header: 'Instagram', accessor: r => r.instagram },
      { header: 'Featured', accessor: r => formatBoolean(r.featured) },
      { header: 'Verified', accessor: r => formatBoolean(r.verified) },
      { header: 'Rating', accessor: r => r.foursquare_rating },
      { header: 'Price Range', accessor: r => r.price_range },
      { header: 'Tags', accessor: r => formatArray(r.tags) },
      { header: 'Amenities', accessor: r => formatArray(r.amenities) },
      { header: 'Latitude', accessor: r => r.latitude },
      { header: 'Longitude', accessor: r => r.longitude },
      { header: 'Created At', accessor: r => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('venues', '*', { column: 'name', ascending: true });
    await exportToExcel(allData, columns, generateFilename('venues'));
  };

  if (rolesLoading || loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box sx={{ textAlign: 'center' }}>Loading...</Box>
      </Container>
    );
  }

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, p: 3 }}>
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
        onGooglePlacesImport={handleGooglePlacesImport}
        onImportComplete={refetch}
        onExport={handleExportExcel}
        isImporting={isImporting}
        isImportingTripAdvisor={isImportingTripAdvisor}
        isImportingTomTom={isImportingTomTom}
        isImportingGooglePlaces={isImportingGooglePlaces}
      />

      {/* Stats */}
      <VenuesStats venues={venues} />

      {/* Filters */}
      <VenuesFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedCity={selectedCity}
        onCityChange={setSelectedCity}
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        selectedAmenities={selectedAmenities}
        onAmenitiesChange={setSelectedAmenities}
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
        <DialogContent sx={{ maxWidth: '72rem', maxHeight: '95vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle>{editingVenue ? 'Edit Venue' : 'Add New Venue'}</DialogTitle>
          </DialogHeader>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Basic Info */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Basic Information</Typography>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleEnrichVenue}
                  disabled={isEnrichingVenue || !formData.name.trim()}
                  style={{ fontSize: '0.875rem' }}
                >
                  {isEnrichingVenue ? "Enriching..." : "🔍 Enrich Venue"}
                </Button>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Label htmlFor="name">Venue Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </Box>
                <Box>
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
                </Box>
              </Box>

              <Box>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </Box>
            </Box>

            {/* Location */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Location</Typography>
              <LocationAutocomplete
                value={formData.address}
                onChange={(address, coordinates, components) => {
                  setFormData(prev => ({
                    ...prev,
                    address,
                    latitude: coordinates ? coordinates.lat.toString() : "",
                    longitude: coordinates ? coordinates.lng.toString() : ""
                  }));

                  // Auto-fill city, state, country from structured components + resolve FKs
                  if (components) {
                    handleAddressComponentsAndResolve(components, coordinates);
                  }
                }}
                onValidation={setIsAddressValidated}
                required
                placeholder="Enter full address (e.g., 123 Main St, New York, NY, USA)"
              />

              {/* Display coordinates if available */}
              {formData.latitude && formData.longitude && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                      readOnly
                      style={{ backgroundColor: 'var(--muted)' }}
                     />
                   </Box>
                   <Box>
                     <Label htmlFor="longitude">Longitude</Label>
                     <Input
                       id="longitude"
                       type="number"
                       step="any"
                       value={formData.longitude}
                       onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                       readOnly
                       style={{ backgroundColor: 'var(--muted)' }}
                     />
                   </Box>
                 </Box>
               )}

               {/* Optional manual city/state/country override */}
               <details>
                 <Box component="summary" sx={{ fontSize: '0.875rem', color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}>
                   Manual location override (optional)
                 </Box>
                 <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, pt: 1 }}>
                   <Box>
                     <Label htmlFor="city">City</Label>
                     <Input
                       id="city"
                       value={formData.city}
                       onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                       placeholder="Auto-filled from address"
                     />
                   </Box>
                   <Box>
                     <Label htmlFor="state">State/Province</Label>
                     <Input
                       id="state"
                       value={formData.state}
                       onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                       placeholder="Auto-filled from address"
                     />
                   </Box>
                   <Box>
                     <Label htmlFor="country">Country</Label>
                     <Input
                       id="country"
                       value={formData.country}
                       onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                       placeholder="Auto-filled from address"
                     />
                   </Box>
                 </Box>
                 <Box>
                   <Label htmlFor="postal_code">Postal Code</Label>
                   <Input
                     id="postal_code"
                     value={formData.postal_code}
                     onChange={(e) => setFormData(prev => ({ ...prev, postal_code: e.target.value }))}
                     placeholder="Auto-filled from address"
                   />
                 </Box>
               </details>
             </Box>

             {/* Contact */}
             <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
               <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Contact Information</Typography>
               <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                 <Box>
                   <Label htmlFor="phone">Phone</Label>
                   <Input
                     id="phone"
                     value={formData.phone}
                     onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                   />
                 </Box>
                 <Box>
                   <Label htmlFor="email">Email</Label>
                   <Input
                     id="email"
                     type="email"
                     value={formData.email}
                     onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                   />
                 </Box>
               </Box>
               <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                 <Box>
                   <Label htmlFor="website">Website</Label>
                   <Input
                     id="website"
                     value={formData.website}
                     onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                   />
                 </Box>
                 <Box>
                   <Label htmlFor="instagram">Instagram</Label>
                   <Input
                     id="instagram"
                     value={formData.instagram}
                     onChange={(e) => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
                   />
                 </Box>
               </Box>
             </Box>

             {/* Settings */}
             <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
               <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Settings</Typography>
               <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                 <Box>
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
                 </Box>
                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                   <Checkbox
                     id="featured"
                     checked={formData.featured}
                     onCheckedChange={(checked) => setFormData(prev => ({ ...prev, featured: checked as boolean }))}
                   />
                   <Label htmlFor="featured">Featured Venue</Label>
                 </Box>
                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                   <Checkbox
                     id="verified"
                     checked={formData.verified}
                     onCheckedChange={(checked) => setFormData(prev => ({ ...prev, verified: checked as boolean }))}
                   />
                   <Label htmlFor="verified">Verified</Label>
                 </Box>
               </Box>
              </Box>

              {/* Venue Attributes */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Venue Attributes</Typography>

                {/* Tags */}
                <Box>
                  <Label>Tags</Label>
                  <Box sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                      {formData.tags.map((tag, index) => (
                        <Box
                          component="span"
                          key={index}
                          sx={{ bgcolor: 'rgba(var(--primary-rgb, 99, 102, 241), 0.1)', color: 'var(--primary)', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => {
                              const newTags = formData.tags.filter((_, i) => i !== index);
                              setFormData(prev => ({ ...prev, tags: newTags }));
                            }}
                            style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            ×
                          </button>
                        </Box>
                      ))}
                    </Box>
                    <Input
                      placeholder="Add tags (press Enter)"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const value = e.currentTarget.value.trim();
                          if (value && !formData.tags.includes(value)) {
                            setFormData(prev => ({ ...prev, tags: [...prev.tags, value] }));
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                  </Box>
                </Box>

                {/* Amenities */}
                <Box>
                  <Label>Amenities</Label>
                  <Box sx={{ mt: 1 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                      {formData.amenities.map((amenity, index) => (
                        <Box
                          component="span"
                          key={index}
                          sx={{ bgcolor: 'rgba(var(--secondary-rgb, 100, 116, 139), 0.1)', color: 'var(--secondary)', px: 1, py: 0.5, borderRadius: 1, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                          {amenity}
                          <button
                            type="button"
                            onClick={() => {
                              const newAmenities = formData.amenities.filter((_, i) => i !== index);
                              setFormData(prev => ({ ...prev, amenities: newAmenities }));
                            }}
                            style={{ color: 'var(--secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            ×
                          </button>
                        </Box>
                      ))}
                    </Box>
                    <Input
                      placeholder="Add amenities (press Enter)"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const value = e.currentTarget.value.trim();
                          if (value && !formData.amenities.includes(value)) {
                            setFormData(prev => ({ ...prev, amenities: [...prev.amenities, value] }));
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <Box sx={{ mt: 1 }}>
                      <Label style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Common amenities:</Label>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {commonAmenities.map(amenity => (
                          <Box
                            component="button"
                            key={amenity}
                            type="button"
                            onClick={() => {
                              if (!formData.amenities.includes(amenity)) {
                                setFormData(prev => ({ ...prev, amenities: [...prev.amenities, amenity] }));
                              }
                            }}
                            disabled={formData.amenities.includes(amenity)}
                            sx={{ fontSize: '0.75rem', px: 1, py: 0.5, borderRadius: 1, bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' }, '&:disabled': { opacity: 0.5 }, border: 'none', cursor: 'pointer' }}
                          >
                            {amenity}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Box>

              {/* Venue Images */}
              <VenueImageUpload
                images={formData.images}
                onChange={(images) => setFormData(prev => ({ ...prev, images }))}
                maxImages={8}
              />

             <Button type="submit" style={{ width: '100%' }}>
               {editingVenue ? 'Update Venue' : 'Add Venue'}
             </Button>
           </Box>
         </DialogContent>
       </Dialog>

       <VenueEnrichmentPreview
         isOpen={showEnrichmentPreview}
         onClose={() => setShowEnrichmentPreview(false)}
         results={enrichmentResults}
         onSelectResult={handleSelectEnrichmentResult}
         venueName={enrichmentVenueName}
       />
     </Box>
  );
}
