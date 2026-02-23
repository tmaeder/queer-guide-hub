import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
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
import { AdultModelsCsvImport } from "@/components/personalities/AdultModelsCsvImport";
import { BulkCreatePersonalities } from "@/components/personalities/BulkCreatePersonalities";
import { ExportExcelButton } from "@/components/admin/ExportExcelButton";
import { exportToExcel, fetchAllRows, formatDate, formatDateTime, formatArray, formatBoolean, generateFilename, type ExportColumnDef } from "@/utils/excelExport";
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
      <Container maxWidth="lg" sx={{ px: 2, py: 4 }}>
        <Card>
          <CardContent sx={{ py: 6 }}>
            <Box sx={{ textAlign: 'center' }}>
              <AlertCircle style={{ height: 48, width: 48, margin: '0 auto', color: 'var(--destructive)', marginBottom: 16 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>Access Denied</Typography>
              <Typography color="text.secondary">You don't have permission to access this page.</Typography>
            </Box>
          </CardContent>
        </Card>
      </Container>
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
        return <Badge sx={{ bgcolor: '#dcfce7', color: '#166534' }}><Check style={{ height: 12, width: 12, marginRight: 4 }} />Verified</Badge>;
      case 'disputed':
        return <Badge sx={{ bgcolor: '#fef9c3', color: '#854d0e' }}><AlertCircle style={{ height: 12, width: 12, marginRight: 4 }} />Disputed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getVisibilityBadge = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return <Badge sx={{ bgcolor: '#dbeafe', color: '#1e40af' }}>Public</Badge>;
      case 'private':
        return <Badge sx={{ bgcolor: '#f3f4f6', color: '#1f2937' }}>Private</Badge>;
      default:
        return <Badge sx={{ bgcolor: '#ffedd5', color: '#9a3412' }}>Draft</Badge>;
    }
  };

  const handleExportExcel = async () => {
    const columns: ExportColumnDef<any>[] = [
      { header: 'Name', accessor: r => r.name },
      { header: 'Pronouns', accessor: r => r.pronouns },
      { header: 'Profession', accessor: r => r.profession },
      { header: 'Nationality', accessor: r => r.nationality },
      { header: 'Birth Place', accessor: r => r.birth_place },
      { header: 'Birth Date', accessor: r => formatDate(r.birth_date) },
      { header: 'Death Date', accessor: r => formatDate(r.death_date) },
      { header: 'Is Living', accessor: r => formatBoolean(r.is_living) },
      { header: 'Verification', accessor: r => r.verification_status },
      { header: 'Visibility', accessor: r => r.visibility },
      { header: 'Featured', accessor: r => formatBoolean(r.is_featured) },
      { header: 'View Count', accessor: r => r.view_count },
      { header: 'Tags', accessor: r => formatArray(r.tags) },
      { header: 'Website', accessor: r => r.website_url },
      { header: 'Created At', accessor: r => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('personalities', '*', { column: 'name', ascending: true });
    await exportToExcel(allData, columns, generateFilename('personalities'));
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
    <Container maxWidth="lg" sx={{ px: 2, py: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4">Personalities Management</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Manage and moderate LGBTQ+ personalities in the directory
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <PersonalitiesCsvImport onImportComplete={refetchPersonalities} />
          <AdultModelsCsvImport onImportComplete={refetchPersonalities} />
          <ExportExcelButton onExport={handleExportExcel} />
        </Box>
      </Box>

      {/* Bulk Import Section */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <BulkCreatePersonalities />
      </Box>

      {/* Stats Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3 }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>Total Personalities</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.total}</Typography>
              </Box>
              <Users style={{ height: 32, width: 32, color: 'var(--muted-foreground)' }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>Verified</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>{stats.verified}</Typography>
              </Box>
              <Check style={{ height: 32, width: 32, color: '#16a34a' }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>Featured</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{stats.featured}</Typography>
              </Box>
              <Star style={{ height: 32, width: 32, color: '#555555' }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>Public</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.main' }}>{stats.public}</Typography>
              </Box>
              <Eye style={{ height: 32, width: 32, color: '#2563eb' }} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Filter style={{ height: 20, width: 20 }} />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
            <Box sx={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input
                placeholder="Search personalities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ pl: 5 }}
              />
            </Box>

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
          </Box>
        </CardContent>
      </Card>

      {/* Personalities Table */}
      <Card>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Personalities ({personalities.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personality</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead sx={{ textAlign: 'right' }}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ height: 40, width: 40, bgcolor: 'action.hover', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ height: 16, width: 128, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite' }} />
                            <Box sx={{ height: 12, width: 96, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite' }} />
                          </Box>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                ) : personalities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                      <Users style={{ height: 48, width: 48, margin: '0 auto', color: 'var(--muted-foreground)', marginBottom: 16 }} />
                      <Typography color="text.secondary">No personalities found</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  personalities.map((personality) => (
                    <TableRow key={personality.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar>
                            <AvatarImage src={personality.image_url} alt={personality.name} />
                            <AvatarFallback>
                              {personality.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Box>
                            <Box sx={{ fontWeight: 500 }}>{personality.name}</Box>
                            {personality.pronouns && (
                              <Typography variant="body2" color="text.secondary">{personality.pronouns}</Typography>
                            )}
                          </Box>
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {personality.profession && (
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{personality.profession}</Typography>
                          )}
                          {personality.nationality && (
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <MapPin style={{ height: 12, width: 12, marginRight: 4 }} />
                              <Typography variant="body2" color="text.secondary">{personality.nationality}</Typography>
                            </Box>
                          )}
                          {personality.birth_date && (
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Calendar style={{ height: 12, width: 12, marginRight: 4 }} />
                              <Typography variant="body2" color="text.secondary">
                                {new Date(personality.birth_date).getFullYear()}
                                {!personality.is_living && personality.death_date &&
                                  ` - ${new Date(personality.death_date).getFullYear()}`
                                }
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {getVisibilityBadge(personality.visibility)}
                          {personality.is_featured && (
                            <Badge sx={{ bgcolor: '#f3e8ff', color: '#6b21a8' }}>
                              <Star style={{ height: 12, width: 12, marginRight: 4 }} />
                              Featured
                            </Badge>
                          )}
                        </Box>
                      </TableCell>

                      <TableCell>{getVerificationBadge(personality.verification_status)}</TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Eye style={{ height: 12, width: 12, marginRight: 4 }} />
                          <Typography variant="body2">{personality.view_count}</Typography>
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(personality.created_at).toLocaleDateString()}
                        </Typography>
                      </TableCell>

                      <TableCell sx={{ textAlign: 'right' }}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" sx={{ height: 32, width: 32, p: 0 }}>
                              <MoreVertical style={{ height: 16, width: 16 }} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sx={{ width: 224 }}>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedPersonality(personality);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Edit style={{ height: 16, width: 16, marginRight: 8 }} />
                              Edit Details
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleVerificationChange(
                                personality.id,
                                personality.verification_status === 'verified' ? 'pending' : 'verified'
                              )}
                            >
                              <Check style={{ height: 16, width: 16, marginRight: 8 }} />
                              {personality.verification_status === 'verified' ? 'Unverify' : 'Verify'}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleFeaturedToggle(personality.id, !personality.is_featured)}
                            >
                              <Star style={{ height: 16, width: 16, marginRight: 8 }} />
                              {personality.is_featured ? 'Unfeature' : 'Feature'}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleVisibilityChange(
                                personality.id,
                                personality.visibility === 'public' ? 'private' : 'public'
                              )}
                            >
                              <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
                              Make {personality.visibility === 'public' ? 'Private' : 'Public'}
                            </DropdownMenuItem>

                            {personality.website_url && (
                              <DropdownMenuItem
                                onClick={() => window.open(personality.website_url, '_blank')}
                              >
                                <ExternalLink style={{ height: 16, width: 16, marginRight: 8 }} />
                                Visit Website
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedPersonality(personality);
                                setDeleteDialogOpen(true);
                              }}
                              sx={{ color: 'error.main' }}
                            >
                              <Trash2 style={{ height: 16, width: 16, marginRight: 8 }} />
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
          </Box>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent sx={{ maxWidth: 672 }}>
          <DialogHeader>
            <DialogTitle>Edit Personality</DialogTitle>
          </DialogHeader>
          {selectedPersonality && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
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
                </Box>

                <Box>
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
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <input
                  type="checkbox"
                  id="featured"
                  checked={selectedPersonality.is_featured}
                  onChange={(e) => handleFeaturedToggle(selectedPersonality.id, e.target.checked)}
                />
                <Label htmlFor="featured">Featured Personality</Label>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}
