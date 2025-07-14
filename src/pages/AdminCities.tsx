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
      // Refresh cities list
      window.location.reload();
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
        
        // Refresh cities list
        window.location.reload();
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
            <h1 className="text-3xl font-bold">Cities Management</h1>
            <p className="text-muted-foreground">Manage cities in the directory</p>
          </div>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add City
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCity ? "Edit City" : "Add New City"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_capital"
                    checked={formData.is_capital}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_capital: checked as boolean }))}
                  />
                  <Label htmlFor="is_capital">Capital City</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_major_city"
                    checked={formData.is_major_city}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_major_city: checked as boolean }))}
                  />
                  <Label htmlFor="is_major_city">Major City</Label>
                </div>
              </div>

              <Button type="submit" className="w-full">
                {editingCity ? "Update City" : "Add City"}
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
                  placeholder="Search cities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-48">
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{cities.length}</p>
                <p className="text-sm text-muted-foreground">Total Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-accent" />
              <div>
                <p className="text-2xl font-bold">{cities.filter(c => c.is_capital).length}</p>
                <p className="text-sm text-muted-foreground">Capital Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{cities.filter(c => c.is_major_city).length}</p>
                <p className="text-sm text-muted-foreground">Major Cities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-secondary" />
              <div>
                <p className="text-2xl font-bold">{countries.length}</p>
                <p className="text-sm text-muted-foreground">Countries</p>
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
          <div className="space-y-4">
            {filteredCities.map((city) => (
              <div key={city.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold">{city.name}</h3>
                    {city.is_capital && (
                      <span className="text-xs px-2 py-1 bg-secondary/10 text-secondary rounded">
                        Capital
                      </span>
                    )}
                    {city.is_major_city && (
                      <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                        Major City
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(city)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(city)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {filteredCities.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No cities found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}