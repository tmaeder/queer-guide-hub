import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { useDirectory } from "@/hooks/useDirectory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  MapPin,
  Building
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function AdminCities() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { cities, countries, loading } = useDirectory();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [filteredCities, setFilteredCities] = useState(cities);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    country_id: "",
    region_name: "",
    population: "",
    latitude: "",
    longitude: "",
    timezone: "",
    is_capital: false,
    is_major_city: false
  });

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
    filterCities();
  }, [cities, searchQuery, selectedCountry]);

  const filterCities = () => {
    let filtered = cities;

    if (searchQuery) {
      filtered = filtered.filter(city => 
        city.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        city.region_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCountry !== "all") {
      filtered = filtered.filter(city => city.country_id === selectedCountry);
    }

    setFilteredCities(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const cityData = {
        name: formData.name,
        country_id: formData.country_id,
        region_name: formData.region_name || null,
        population: formData.population ? parseInt(formData.population) : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        timezone: formData.timezone || null,
        is_capital: formData.is_capital,
        is_major_city: formData.is_major_city
      };

      if (editingCity) {
        const { error } = await supabase
          .from('cities')
          .update(cityData)
          .eq('id', editingCity.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "City updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('cities')
          .insert([cityData]);

        if (error) throw error;

        toast({
          title: "Success", 
          description: "City created successfully"
        });
      }

      resetForm();
      setIsCreateDialogOpen(false);
      setEditingCity(null);
      // Refresh cities list by re-mounting the component via navigation
      navigate("/admin/cities", { replace: true });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save city",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (city: any) => {
    setFormData({
      name: city.name,
      country_id: city.country_id,
      region_name: city.region_name || "",
      population: city.population?.toString() || "",
      latitude: city.latitude?.toString() || "",
      longitude: city.longitude?.toString() || "",
      timezone: city.timezone || "",
      is_capital: city.is_capital || false,
      is_major_city: city.is_major_city || false
    });
    setEditingCity(city);
    setIsCreateDialogOpen(true);
  };

  const handleDelete = async (city: any) => {
    if (confirm(`Are you sure you want to delete the city "${city.name}"?`)) {
      try {
        const { error } = await supabase
          .from('cities')
          .delete()
          .eq('id', city.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "City deleted successfully"
        });
        
        // Refresh cities list by re-mounting the component via navigation
        navigate("/admin/cities", { replace: true });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete city",
          variant: "destructive"
        });
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      country_id: "",
      region_name: "",
      population: "",
      latitude: "",
      longitude: "",
      timezone: "",
      is_capital: false,
      is_major_city: false
    });
    setEditingCity(null);
  };

  if (rolesLoading || loading) {
    return (
      <div sx={{ maxWidth: 'lg', mx: 'auto', p: 3 }}>
        <div sx={{ textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div sx={{ width: '100%', p: 3 }}>
      {/* Header */}
      <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <div sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back to Dashboard
          </Button>
          <div>
            <h1 sx={{ fontSize: '1.875rem', fontWeight: 700 }}>Cities Management</h1>
            <p style={{ color: 'var(--muted-foreground)' }}>Manage cities in the directory</p>
          </div>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
              Add City
            </Button>
          </DialogTrigger>
          <DialogContent sx={{ maxWidth: 672 }}>
            <DialogHeader>
              <DialogTitle>{editingCity ? "Edit City" : "Add New City"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <div>
                  <Label htmlFor="name">City Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="country_id">Country</Label>
                  <Select
                    value={formData.country_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, country_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map(country => (
                        <SelectItem key={country.id} value={country.id}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <div>
                  <Label htmlFor="region_name">Region/State</Label>
                  <Input
                    id="region_name"
                    value={formData.region_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, region_name: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label htmlFor="population">Population</Label>
                  <Input
                    id="population"
                    type="number"
                    value={formData.population}
                    onChange={(e) => setFormData(prev => ({ ...prev, population: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <div>
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                    placeholder="Optional"
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
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                  placeholder="e.g., America/New_York"
                />
              </div>

              <div sx={{ display: 'flex', gap: 2 }}>
                <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="is_capital"
                    checked={formData.is_capital}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_capital: checked as boolean }))}
                  />
                  <Label htmlFor="is_capital">Capital City</Label>
                </div>
                <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="is_major_city"
                    checked={formData.is_major_city}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_major_city: checked as boolean }))}
                  />
                  <Label htmlFor="is_major_city">Major City</Label>
                </div>
              </div>

              <Button type="submit" sx={{ width: '100%' }}>
                {editingCity ? "Update City" : "Add City"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <div sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
            <div sx={{ flex: 1 }}>
              <div sx={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Input
                  placeholder="Search cities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  sx={{ pl: 5 }}
                />
              </div>
            </div>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger sx={{ width: 192 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country.id} value={country.id}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 3, mb: 4 }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ height: 20, width: 20, color: 'var(--primary)' }} />
              <div>
                <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{cities.length}</p>
                <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Total Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Building style={{ height: 20, width: 20, color: 'var(--accent)' }} />
              <div>
                <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{cities.filter(c => c.is_capital).length}</p>
                <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Capital Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Building style={{ height: 20, width: 20, color: 'var(--primary)' }} />
              <div>
                <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{cities.filter(c => c.is_major_city).length}</p>
                <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Major Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ height: 20, width: 20, color: 'var(--secondary)' }} />
              <div>
                <p sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{countries.length}</p>
                <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Countries</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cities List */}
      <Card>
        <CardHeader>
          <CardTitle>Cities ({filteredCities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredCities.map((city) => (
              <div key={city.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, border: 1, borderColor: 'divider', borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                <div sx={{ flex: 1 }}>
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <h3 sx={{ fontWeight: 600 }}>{city.name}</h3>
                    {city.is_capital && (
                      <span sx={{ fontSize: '0.75rem', px: 1, py: 0.5, bgcolor: 'rgba(var(--secondary-rgb), 0.1)', color: 'secondary.main', borderRadius: 1 }}>
                        Capital
                      </span>
                    )}
                    {city.is_major_city && (
                      <span sx={{ fontSize: '0.75rem', px: 1, py: 0.5, bgcolor: 'rgba(var(--primary-rgb), 0.1)', color: 'primary.main', borderRadius: 1 }}>
                        Major City
                      </span>
                    )}
                  </div>
                  
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
                    <div>
                      Country: {countries.find(c => c.id === city.country_id)?.name}
                    </div>
                    {city.region_name && (
                      <div>Region: {city.region_name}</div>
                    )}
                    {city.population && (
                      <div>Population: {city.population.toLocaleString()}</div>
                    )}
                  </div>
                </div>
                
                <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(city)}
                  >
                    <Edit style={{ height: 16, width: 16 }} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(city)}
                  >
                    <Trash2 style={{ height: 16, width: 16 }} />
                  </Button>
                </div>
              </div>
            ))}
            
            {filteredCities.length === 0 && (
              <div sx={{ textAlign: 'center', py: 4 }}>
                <p style={{ color: 'var(--muted-foreground)' }}>No cities found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}