import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { usePersonalities, PersonalityFilters } from "@/hooks/usePersonalities";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { toast } from "@/hooks/use-toast";
import { PersonalitiesCsvImport } from "@/components/personalities/PersonalitiesCsvImport";
import { 
  Users, 
  Search, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Check, 
  X, 
  AlertCircle, 
  Star, 
  Eye,
  Calendar,
  MapPin,
  ExternalLink,
  Filter,
  Download
} from "lucide-react";

export default function AdminPersonalities() {
  const { isAdmin } = useAdminRoles();
  const [filters, setFilters] = useState<PersonalityFilters>({ limit: 50 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersonality, setSelectedPersonality] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const { personalities, loading, updatePersonality, refetchPersonalities } = usePersonalities({
    ...filters,
    search: searchTerm
  });

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleVerificationChange = async (personalityId: string, status: 'verified' | 'disputed' | 'pending') => {
    try {
      await updatePersonality(personalityId, { verification_status: status });
      toast({
        title: "Success",
        description: `Personality verification status updated to ${status}`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update verification status",
        variant: "destructive"
      });
    }
  };

  const handleFeaturedToggle = async (personalityId: string, featured: boolean) => {
    try {
      await updatePersonality(personalityId, { is_featured: featured });
      toast({
        title: "Success",
        description: featured ? "Personality featured" : "Personality unfeatured"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update featured status",
        variant: "destructive"
      });
    }
  };

  const handleVisibilityChange = async (personalityId: string, visibility: 'public' | 'private' | 'draft') => {
    try {
      await updatePersonality(personalityId, { visibility });
      toast({
        title: "Success",
        description: `Personality visibility changed to ${visibility}`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update visibility",
        variant: "destructive"
      });
    }
  };

  const getVerificationBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" />Verified</Badge>;
      case 'disputed':
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertCircle className="h-3 w-3 mr-1" />Disputed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getVisibilityBadge = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return <Badge className="bg-blue-100 text-blue-800">Public</Badge>;
      case 'private':
        return <Badge className="bg-gray-100 text-gray-800">Private</Badge>;
      default:
        return <Badge className="bg-orange-100 text-orange-800">Draft</Badge>;
    }
  };

  const exportPersonalities = () => {
    const csv = [
      ['Name', 'Pronouns', 'Profession', 'Nationality', 'Verification', 'Visibility', 'Featured', 'Views', 'Created At'].join(','),
      ...personalities.map(p => [
        p.name,
        p.pronouns || '',
        p.profession || '',
        p.nationality || '',
        p.verification_status,
        p.visibility,
        p.is_featured ? 'Yes' : 'No',
        p.view_count,
        new Date(p.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'personalities.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStats = () => {
    const totalPersonalities = personalities.length;
    const verified = personalities.filter(p => p.verification_status === 'verified').length;
    const featured = personalities.filter(p => p.is_featured).length;
    const publicPersonalities = personalities.filter(p => p.visibility === 'public').length;
    
    return { total: totalPersonalities, verified, featured, public: publicPersonalities };
  };

  const stats = getStats();

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Personalities Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage and moderate LGBTQ+ personalities in the directory
          </p>
        </div>
        <div className="flex gap-2">
          <PersonalitiesCsvImport onImportComplete={refetchPersonalities} />
          <Button onClick={exportPersonalities} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Personalities</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Verified</p>
                <p className="text-2xl font-bold text-green-600">{stats.verified}</p>
              </div>
              <Check className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Featured</p>
                <p className="text-2xl font-bold text-purple-600">{stats.featured}</p>
              </div>
              <Star className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Public</p>
                <p className="text-2xl font-bold text-blue-600">{stats.public}</p>
              </div>
              <Eye className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search personalities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select
              value={filters.verification_status || 'all'}
              onValueChange={(value) => setFilters(prev => ({ 
                ...prev, 
                verification_status: value === 'all' ? undefined : value 
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Verification Status</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.featured_only ? 'featured' : 'all'}
              onValueChange={(value) => setFilters(prev => ({ 
                ...prev, 
                featured_only: value === 'featured' || undefined 
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Featured Status</SelectItem>
                <SelectItem value="featured">Featured Only</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.is_living === undefined ? 'all' : filters.is_living ? 'living' : 'deceased'}
              onValueChange={(value) => setFilters(prev => ({ 
                ...prev, 
                is_living: value === 'all' ? undefined : value === 'living' 
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="living">Living</SelectItem>
                <SelectItem value="deceased">Deceased</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Personalities Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Personalities ({personalities.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personality</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <div className="flex items-center space-x-3">
                          <div className="h-10 w-10 bg-muted rounded-full animate-pulse" />
                          <div className="space-y-2">
                            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : personalities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No personalities found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  personalities.map((personality) => (
                    <TableRow key={personality.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarImage src={personality.image_url} alt={personality.name} />
                            <AvatarFallback>
                              {personality.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{personality.name}</div>
                            {personality.pronouns && (
                              <div className="text-sm text-muted-foreground">{personality.pronouns}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          {personality.profession && (
                            <div className="text-sm font-medium">{personality.profession}</div>
                          )}
                          {personality.nationality && (
                            <div className="flex items-center text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3 mr-1" />
                              {personality.nationality}
                            </div>
                          )}
                          {personality.birth_date && (
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3 mr-1" />
                              {new Date(personality.birth_date).getFullYear()}
                              {!personality.is_living && personality.death_date && 
                                ` - ${new Date(personality.death_date).getFullYear()}`
                              }
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-2">
                          {getVisibilityBadge(personality.visibility)}
                          {personality.is_featured && (
                            <Badge className="bg-purple-100 text-purple-800">
                              <Star className="h-3 w-3 mr-1" />
                              Featured
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>{getVerificationBadge(personality.verification_status)}</TableCell>

                      <TableCell>
                        <div className="flex items-center text-sm">
                          <Eye className="h-3 w-3 mr-1" />
                          {personality.view_count}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {new Date(personality.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedPersonality(personality);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Details
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem
                              onClick={() => handleVerificationChange(
                                personality.id, 
                                personality.verification_status === 'verified' ? 'pending' : 'verified'
                              )}
                            >
                              <Check className="h-4 w-4 mr-2" />
                              {personality.verification_status === 'verified' ? 'Unverify' : 'Verify'}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleFeaturedToggle(personality.id, !personality.is_featured)}
                            >
                              <Star className="h-4 w-4 mr-2" />
                              {personality.is_featured ? 'Unfeature' : 'Feature'}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleVisibilityChange(
                                personality.id, 
                                personality.visibility === 'public' ? 'private' : 'public'
                              )}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Make {personality.visibility === 'public' ? 'Private' : 'Public'}
                            </DropdownMenuItem>

                            {personality.website_url && (
                              <DropdownMenuItem
                                onClick={() => window.open(personality.website_url, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Visit Website
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedPersonality(personality);
                                setDeleteDialogOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Personality</DialogTitle>
          </DialogHeader>
          {selectedPersonality && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Verification Status</Label>
                  <Select
                    value={selectedPersonality.verification_status}
                    onValueChange={(value) => 
                      handleVerificationChange(selectedPersonality.id, value as any)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                      <SelectItem value="disputed">Disputed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Visibility</Label>
                  <Select
                    value={selectedPersonality.visibility}
                    onValueChange={(value) => 
                      handleVisibilityChange(selectedPersonality.id, value as any)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="featured"
                  checked={selectedPersonality.is_featured}
                  onChange={(e) => handleFeaturedToggle(selectedPersonality.id, e.target.checked)}
                />
                <Label htmlFor="featured">Featured Personality</Label>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}