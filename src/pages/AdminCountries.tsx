import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Globe, Search, Plus, Edit, Trash2, Users, BarChart3 } from "lucide-react";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function AdminCountries() {
  const { isAdmin, isModerator } = useAdminRoles();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [continentFilter, setContinentFilter] = useState('all');

  // Mock country data - in a real app, this would come from your database
  const mockCountries = [
    { 
      id: '1', 
      name: 'United States', 
      code: 'US',
      continent: 'North America',
      capital: 'Washington, D.C.',
      population: 331900000,
      area: 9833517,
      gdp: 25462700000000,
      languages: ['English'],
      currency: 'USD'
    },
    { 
      id: '2', 
      name: 'Canada', 
      code: 'CA',
      continent: 'North America',
      capital: 'Ottawa',
      population: 38000000,
      area: 9984670,
      gdp: 1988000000000,
      languages: ['English', 'French'],
      currency: 'CAD'
    },
    { 
      id: '3', 
      name: 'United Kingdom', 
      code: 'GB',
      continent: 'Europe',
      capital: 'London',
      population: 67500000,
      area: 243610,
      gdp: 3131000000000,
      languages: ['English'],
      currency: 'GBP'
    },
    { 
      id: '4', 
      name: 'Germany', 
      code: 'DE',
      continent: 'Europe',
      capital: 'Berlin',
      population: 83200000,
      area: 357022,
      gdp: 4259000000000,
      languages: ['German'],
      currency: 'EUR'
    },
    { 
      id: '5', 
      name: 'Australia', 
      code: 'AU',
      continent: 'Oceania',
      capital: 'Canberra',
      population: 25700000,
      area: 7692024,
      gdp: 1552000000000,
      languages: ['English'],
      currency: 'AUD'
    }
  ];

  const filteredCountries = mockCountries.filter(country => {
    const matchesSearch = country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         country.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         country.capital.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesContinent = continentFilter === 'all' || country.continent === continentFilter;
    return matchesSearch && matchesContinent;
  });

  const continents = [...new Set(mockCountries.map(country => country.continent))];

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

  const handleEditCountry = (countryId: string) => {
    toast({
      title: "Edit Country",
      description: `Editing country with ID: ${countryId}`,
    });
  };

  const handleDeleteCountry = (countryId: string, countryName: string) => {
    toast({
      title: "Country Deleted",
      description: `${countryName} has been deleted successfully.`,
      variant: "destructive",
    });
  };

  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Countries Management</h1>
            <p className="text-muted-foreground">
              Manage countries, their information, and geographical data
            </p>
          </div>
          {(isAdmin || isModerator) && (
            <Button onClick={() => handleAddCountry()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Country
            </Button>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Countries</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockCountries.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Population</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(mockCountries.reduce((sum, country) => sum + country.population, 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total GDP</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(mockCountries.reduce((sum, country) => sum + country.gdp, 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Continents</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{continents.length}</div>
          </CardContent>
        </Card>
      </div>

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
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search countries by name, code, or capital..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={continentFilter} onValueChange={setContinentFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by continent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Continents</SelectItem>
                {continents.map(continent => (
                  <SelectItem key={continent} value={continent}>{continent}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Countries Table */}
          <div className="rounded-md border">
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
                      <div>
                        <div className="font-medium">{country.name}</div>
                        <div className="text-sm text-muted-foreground">{country.code}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{country.continent}</Badge>
                    </TableCell>
                    <TableCell>{country.capital}</TableCell>
                    <TableCell>{formatNumber(country.population)}</TableCell>
                    <TableCell>{formatNumber(country.area)}</TableCell>
                    <TableCell>{formatCurrency(country.gdp)}</TableCell>
                    <TableCell>{country.currency}</TableCell>
                    {(isAdmin || isModerator) && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditCountry(country.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
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
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDeleteCountry(country.id, country.name)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredCountries.length === 0 && (
            <div className="text-center py-8">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No countries found matching your criteria.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}