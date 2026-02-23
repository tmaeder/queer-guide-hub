import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Globe, Search, Plus, Edit, Trash2, Users, BarChart3 } from "lucide-react";
import { ExportExcelButton } from "@/components/admin/ExportExcelButton";
import { exportToExcel, fetchAllRows, generateFilename, type ExportColumnDef } from "@/utils/excelExport";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

export default function AdminCountries() {
  const { isAdmin, isModerator } = useAdminRoles();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [continentFilter, setContinentFilter] = useState('all');
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    capital: '',
    population: '',
    area_km2: '',
    gdp_usd: '',
    currency: ''
  });

  // Fetch countries from database
  useEffect(() => {
    fetchCountries();
  }, []);

  const fetchCountries = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('countries')
        .select(`
          id,
          name,
          code,
          capital,
          population,
          area_km2,
          gdp_usd,
          currency,
          continents!inner(name)
        `)
        .order('name');

      if (error) {
        console.error('Error fetching countries:', error);
        toast({
          title: "Error",
          description: "Failed to load countries data.",
          variant: "destructive",
        });
        return;
      }

      // Transform the data to match our expected format
      const transformedData = data?.map(country => ({
        id: country.id,
        name: country.name,
        code: country.code,
        continent: country.continents?.name || 'Unknown',
        capital: country.capital,
        population: country.population || 0,
        area: country.area_km2 || 0,
        gdp: country.gdp_usd || 0,
        currency: country.currency
      })) || [];

      setCountries(transformedData);
    } catch (error) {
      console.error('Error fetching countries:', error);
      toast({
        title: "Error",
        description: "Failed to load countries data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCountries = countries.filter(country => {
    const matchesSearch = country.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         country.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         country.capital?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesContinent = continentFilter === 'all' || country.continent === continentFilter;
    return matchesSearch && matchesContinent;
  });

  const continents = [...new Set(countries.map(country => country.continent).filter(Boolean))];

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(amount);
  };

  const handleAddCountry = () => {
    toast({
      title: "Add Country",
      description: "Country creation form would open here.",
    });
  };

  const handleEditCountry = async (countryId: string) => {
    const country = countries.find(c => c.id === countryId);
    if (country) {
      setEditingCountry(country);
      setFormData({
        name: country.name || '',
        code: country.code || '',
        capital: country.capital || '',
        population: country.population?.toString() || '',
        area_km2: country.area?.toString() || '',
        gdp_usd: country.gdp?.toString() || '',
        currency: country.currency || ''
      });
      setEditDialogOpen(true);
    }
  };

  const handleSaveCountry = async () => {
    if (!editingCountry) return;

    try {
      const updateData = {
        name: formData.name,
        code: formData.code,
        capital: formData.capital,
        population: formData.population ? parseInt(formData.population) : null,
        area_km2: formData.area_km2 ? parseFloat(formData.area_km2) : null,
        gdp_usd: formData.gdp_usd ? parseFloat(formData.gdp_usd) : null,
        currency: formData.currency
      };

      const { error } = await supabase
        .from('countries')
        .update(updateData)
        .eq('id', editingCountry.id);

      if (error) {
        console.error('Error updating country:', error);
        toast({
          title: "Error",
          description: "Failed to update country.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `${formData.name} has been updated successfully.`,
      });

      setEditDialogOpen(false);
      setEditingCountry(null);
      fetchCountries(); // Refresh the list
    } catch (error) {
      console.error('Error updating country:', error);
      toast({
        title: "Error",
        description: "Failed to update country.",
        variant: "destructive",
      });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDeleteCountry = (countryId: string, countryName: string) => {
    toast({
      title: "Country Deleted",
      description: `${countryName} has been deleted successfully.`,
      variant: "destructive",
    });
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Countries Management</Typography>
            <Typography variant="body2" color="text.secondary">
              Manage countries, their information, and geographical data
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ExportExcelButton onExport={async () => {
              const columns: ExportColumnDef<any>[] = [
                { header: 'Name', accessor: r => r.name },
                { header: 'Code', accessor: r => r.code },
                { header: 'Continent', accessor: r => r.continents?.name },
                { header: 'Capital', accessor: r => r.capital },
                { header: 'Population', accessor: r => r.population },
                { header: 'Area (km²)', accessor: r => r.area_km2 },
                { header: 'GDP (USD)', accessor: r => r.gdp_usd },
                { header: 'Currency', accessor: r => r.currency },
                { header: 'Equality Score', accessor: r => r.equality_score },
                { header: 'LGBT Legal Status', accessor: r => r.lgbt_legal_status },
              ];
              const allData = await fetchAllRows('countries', '*, continents(name)', { column: 'name', ascending: true });
              await exportToExcel(allData, columns, generateFilename('countries'));
            }} />
            {(isAdmin || isModerator) && (
              <Button onClick={() => handleAddCountry()}>
                <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
                Add Country
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {/* Quick Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3, mb: 4 }}>
        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Countries</CardTitle>
            <Globe style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{countries.length}</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total Population</CardTitle>
            <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatNumber(countries.reduce((sum, country) => sum + (country.population || 0), 0))}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Total GDP</CardTitle>
            <BarChart3 style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {formatCurrency(countries.reduce((sum, country) => sum + (country.gdp || 0), 0))}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500 }}>Continents</CardTitle>
            <Globe style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{continents.length}</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Countries Management */}
      <Card>
        <CardHeader>
          <CardTitle>Countries Directory</CardTitle>
          <CardDescription>
            Search and manage country information and statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
            <Box sx={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input
                placeholder="Search countries by name, code, or capital..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </Box>
            <Select value={continentFilter} onValueChange={setContinentFilter}>
              <SelectTrigger style={{ width: '100%', maxWidth: 200 }}>
                <SelectValue placeholder="Filter by continent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Continents</SelectItem>
                {continents.map(continent => (
                  <SelectItem key={continent} value={continent}>{continent}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          {/* Countries Table */}
          {loading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Box sx={{ height: 32, width: 32, border: 4, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%', mx: 'auto', mb: 2, animation: 'spin 1s linear infinite' }} />
              <Typography variant="body2" color="text.secondary">Loading countries...</Typography>
            </Box>
          ) : (
            <Box sx={{ borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Continent</TableHead>
                    <TableHead>Capital</TableHead>
                    <TableHead>Population</TableHead>
                    <TableHead>Area (km²)</TableHead>
                    <TableHead>GDP</TableHead>
                    <TableHead>Currency</TableHead>
                    {(isAdmin || isModerator) && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCountries.map((country) => (
                    <TableRow key={country.id}>
                      <TableCell>
                        <Box>
                          <Box sx={{ fontWeight: 500 }}>{country.name}</Box>
                          <Typography variant="body2" color="text.secondary">{country.code}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{country.continent}</Badge>
                      </TableCell>
                      <TableCell>{country.capital || 'N/A'}</TableCell>
                      <TableCell>{country.population ? formatNumber(country.population) : 'N/A'}</TableCell>
                      <TableCell>{country.area ? formatNumber(country.area) : 'N/A'}</TableCell>
                      <TableCell>{country.gdp ? formatCurrency(country.gdp) : 'N/A'}</TableCell>
                      <TableCell>{country.currency || 'N/A'}</TableCell>
                      {(isAdmin || isModerator) && (
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditCountry(country.id)}
                            >
                              <Edit style={{ height: 16, width: 16 }} />
                            </Button>
                            {isAdmin && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" style={{ color: 'var(--destructive)' }}>
                                    <Trash2 style={{ height: 16, width: 16 }} />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Country</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete {country.name}?
                                      This action cannot be undone and will affect all related data.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
                                      onClick={() => handleDeleteCountry(country.id, country.name)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {!loading && filteredCountries.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Globe style={{ height: 48, width: 48, color: 'var(--muted-foreground)', margin: '0 auto 16px' }} />
              <Typography variant="body2" color="text.secondary">No countries found matching your criteria.</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Edit Country Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent style={{ maxWidth: 672 }}>
          <DialogHeader>
            <DialogTitle>Edit Country</DialogTitle>
            <DialogDescription>
              Update the information for {editingCountry?.name}
            </DialogDescription>
          </DialogHeader>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, py: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="name">Country Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter country name"
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="code">Country Code</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => handleInputChange('code', e.target.value)}
                placeholder="e.g., US, GB, DE"
                maxLength={3}
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="capital">Capital City</Label>
              <Input
                id="capital"
                value={formData.capital}
                onChange={(e) => handleInputChange('capital', e.target.value)}
                placeholder="Enter capital city"
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={(e) => handleInputChange('currency', e.target.value)}
                placeholder="e.g., USD, EUR, GBP"
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="population">Population</Label>
              <Input
                id="population"
                type="number"
                value={formData.population}
                onChange={(e) => handleInputChange('population', e.target.value)}
                placeholder="Enter population"
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="area">Area (km²)</Label>
              <Input
                id="area"
                type="number"
                value={formData.area_km2}
                onChange={(e) => handleInputChange('area_km2', e.target.value)}
                placeholder="Enter area in km²"
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, gridColumn: { md: 'span 2' } }}>
              <Label htmlFor="gdp">GDP (USD)</Label>
              <Input
                id="gdp"
                type="number"
                value={formData.gdp_usd}
                onChange={(e) => handleInputChange('gdp_usd', e.target.value)}
                placeholder="Enter GDP in USD"
              />
            </Box>
          </Box>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCountry}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
