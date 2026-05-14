import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useVenues } from '@/hooks/useVenues';
import { toast } from 'sonner';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { supabase } from '@/integrations/supabase/client';
import type { AddressComponents } from '@/components/ui/location-autocomplete';
import { VenueEnrichmentPreview } from '@/components/admin/venues/VenueEnrichmentPreview';
import { VenuesCsvImport } from '@/components/venues/VenuesCsvImport';
import { VenueImportDialog } from '@/components/admin/venues/VenueImportDialog';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatArray,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig } from '@/components/admin/data-table/types';
import { Edit, Trash2, Plus, Search, ExternalLink } from 'lucide-react';

import { useVenueColumns } from './admin-venues/VenueColumns';
import { VenueEditDialog } from './admin-venues/VenueEditDialog';
import { type VenueRow, type VenueFormData, venueCategories, emptyFormData } from './admin-venues/types';

export default function AdminVenues() {
  const { user } = useAuth();
  const { createVenue, updateVenue, deleteVenue, refetch } = useVenues(false);
  const { resolveAddress } = useAddressResolver();
  const columns = useVenueColumns();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueRow | null>(null);
  const [isEnrichingVenue, setIsEnrichingVenue] = useState(false);
  const [enrichmentResults, setEnrichmentResults] = useState<Record<string, unknown>[]>([]);
  const [showEnrichmentPreview, setShowEnrichmentPreview] = useState(false);
  const [enrichmentVenueName, setEnrichmentVenueName] = useState('');
  const [importDialog, setImportDialog] = useState<{
    open: boolean;
    provider: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor' | null;
  }>({ open: false, provider: null });
  const [isImporting, setIsImporting] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<VenueFormData>(emptyFormData);

  const resetForm = () => {
    setFormData(emptyFormData);
    setEditingVenue(null);
  };

  const handleEditVenue = (venue: VenueRow) => {
    setEditingVenue(venue);
    setFormData({
      name: venue.name || '',
      description: venue.description || '',
      category: venue.category || '',
      address: venue.address || '',
      city: venue.city || '',
      state: venue.state || '',
      country: venue.country || 'US',
      postal_code: venue.postal_code || '',
      phone: venue.phone || '',
      email: venue.email || '',
      website: venue.website || '',
      instagram: venue.instagram || '',
      price_range: venue.price_range?.toString() || '1',
      is_featured: venue.is_featured || false,
      verified: venue.verified || false,
      latitude: venue.latitude?.toString() || '',
      longitude: venue.longitude?.toString() || '',
      amenities: venue.amenities || [],
      tags: venue.tags || [],
      images: venue.images || [],
      city_id: venue.city_id ?? undefined,
      country_id: venue.country_id ?? undefined,
      is_organizer: venue.is_organizer || false,
      organizer_handles: (venue.organizer_handles as Record<string, string>) || {},
    });
    setIsCreateDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Validation Error: Venue name is required');
      return;
    }
    try {
      const venueData: Record<string, unknown> = {
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
        latitude: formData.latitude?.trim() ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude?.trim() ? parseFloat(formData.longitude) : null,
        images: formData.images.length > 0 ? formData.images : [],
        is_featured: formData.is_featured,
        verified: formData.verified,
        is_organizer: formData.is_organizer,
        organizer_handles: Object.keys(formData.organizer_handles).length > 0 ? formData.organizer_handles : null,
        created_by: user?.id,
      };
      if (formData.city_id) venueData.city_id = formData.city_id;
      if (formData.country_id) venueData.country_id = formData.country_id;

      const result = editingVenue
        ? await updateVenue(editingVenue.id, venueData)
        : await createVenue(venueData);
      if (result.error) throw new Error(result.error);

      toast.success(`Success: ${editingVenue ? 'Venue updated' : 'Venue created'}`);
      resetForm();
      setIsCreateDialogOpen(false);
    } catch (error) {
      toast.error(`Error: ${error}`);
    }
  };

  const handleDeleteVenue = async (venue: VenueRow) => {
    if (!confirm(`Delete "${venue.name}"?`)) return;
    try {
      const { error } = await deleteVenue(venue.id);
      if (error) throw new Error(error);
      toast.success('Success: Venue deleted');
    } catch {
      toast.error('Error: Failed to delete venue');
    }
  };

  const handleImport = async (provider: string, fnName: string, config?: Record<string, unknown>) => {
    setIsImporting((prev) => ({ ...prev, [provider]: true }));
    try {
      const { data, error } = await supabase.functions.invoke(fnName, { body: config ?? { trigger: 'manual' } });
      if (error) throw error;
      toast.success(`Import Completed: ${data.message}`);
    } catch {
      toast.error(`Import Failed: Failed to import from ${provider}`);
    } finally {
      setIsImporting((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleImportDialogSubmit = (config: Record<string, unknown>) => {
    const fnMap: Record<string, string> = {
      foursquare: 'import-foursquare-venues',
      tripadvisor: 'import-tripadvisor-venues',
      tomtom: 'import-tomtom-venues',
      'google-places': 'import-google-places-venues',
    };
    if (importDialog.provider) handleImport(importDialog.provider, fnMap[importDialog.provider], config);
    setImportDialog({ open: false, provider: null });
  };

  const handleAddressComponents = async (
    components: AddressComponents | undefined,
    coordinates?: { lat: number; lng: number },
  ) => {
    if (!components) return;
    setFormData((prev) => ({
      ...prev,
      city: components.city || prev.city,
      state: components.state || prev.state,
      country: components.country || prev.country,
      postal_code: components.postcode || prev.postal_code,
    }));
    if (components.country) {
      const resolved = await resolveAddress(components.city, components.country, coordinates?.lat, coordinates?.lng);
      if (resolved) {
        setFormData((prev) => ({
          ...prev,
          ...(resolved.city_id ? { city_id: resolved.city_id } : {}),
          ...(resolved.country_id ? { country_id: resolved.country_id } : {}),
          ...(resolved.city_name ? { city: resolved.city_name } : {}),
          ...(resolved.country_name ? { country: resolved.country_name } : {}),
        }));
        if (resolved.created) toast.success(`New City Created: "${resolved.city_name}" added to database.`);
      }
    }
  };

  const handleEnrichVenue = async () => {
    if (!formData.name.trim()) { toast.error('Error: Enter a venue name first'); return; }
    setIsEnrichingVenue(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-venue', { body: { venueName: formData.name, currentData: formData } });
      if (error) throw error;
      if (data?.individualResults?.length > 0) {
        setEnrichmentResults(data.individualResults);
        setEnrichmentVenueName(formData.name);
        setShowEnrichmentPreview(true);
      } else {
        toast.error('No Results: No enrichment data found');
      }
    } catch { toast.error('Error: Failed to enrich venue'); }
    finally { setIsEnrichingVenue(false); }
  };

  const handleSelectEnrichmentResult = (selectedData: Record<string, unknown>) => {
    const updated = { ...formData };
    Object.entries(selectedData).forEach(([key, value]) => {
      if (value && (!updated[key as keyof typeof updated] || updated[key as keyof typeof updated] === '')) {
        (updated as Record<string, unknown>)[key] = value;
      }
    });
    setFormData(updated);
    setShowEnrichmentPreview(false);
    toast.success('Success: Venue data enriched');
  };

  const handleExportExcel = async () => {
    const cols: ExportColumnDef<Record<string, unknown>>[] = [
      { header: 'Name', accessor: (r) => r.name },
      { header: 'Category', accessor: (r) => r.category },
      { header: 'Address', accessor: (r) => r.address },
      { header: 'City', accessor: (r) => r.city },
      { header: 'State', accessor: (r) => r.state },
      { header: 'Country', accessor: (r) => r.country },
      { header: 'Phone', accessor: (r) => r.phone },
      { header: 'Email', accessor: (r) => r.email },
      { header: 'Website', accessor: (r) => r.website },
      { header: 'Instagram', accessor: (r) => r.instagram },
      { header: 'Featured', accessor: (r) => formatBoolean(r.is_featured) },
      { header: 'Verified', accessor: (r) => formatBoolean(r.verified) },
      { header: 'Rating', accessor: (r) => r.foursquare_rating },
      { header: 'Price Range', accessor: (r) => r.price_range },
      { header: 'Tags', accessor: (r) => formatArray(r.tags) },
      { header: 'Amenities', accessor: (r) => formatArray(r.amenities) },
      { header: 'Latitude', accessor: (r) => r.latitude },
      { header: 'Longitude', accessor: (r) => r.longitude },
      { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
    ];
    const allData = await fetchAllRows('venues', '*', { column: 'name', ascending: true });
    await exportToExcel(allData, cols, generateFilename('venues'));
  };

  const tableConfig: AdminTableConfig<VenueRow> = useMemo(
    () => ({
      tableName: 'venues',
      select: 'id,name,description,category,address,city,state,country,postal_code,phone,email,website,instagram,is_featured,verified,price_range,foursquare_rating,latitude,longitude,amenities,tags,images,city_id,country_id,created_at,created_by,is_organizer,organizer_handles',
      columns,
      defaultSort: { column: 'name', direction: 'asc' as const },
      defaultPageSize: 50,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'address', 'city', 'description'],
      entityFilters: [
        { key: 'category', label: 'Category', type: 'select', column: 'category', options: venueCategories.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })) },
        { key: 'city', label: 'City', type: 'select', column: 'city', dynamicOptions: { tableName: 'venues', column: 'city' } },
        { key: 'is_featured', label: 'Featured', type: 'boolean', column: 'is_featured' },
        { key: 'verified', label: 'Verified', type: 'boolean', column: 'verified' },
        { key: 'is_organizer', label: 'Organizer', type: 'boolean', column: 'is_organizer' },
      ],
      bulkEditFields: [
        { key: 'category', label: 'Category', type: 'select', column: 'category', options: venueCategories.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })) },
        { key: 'is_featured', label: 'Featured', type: 'boolean', column: 'is_featured' },
        { key: 'verified', label: 'Verified', type: 'boolean', column: 'verified' },
        { key: 'is_organizer', label: 'Organizer', type: 'boolean', column: 'is_organizer' },
      ],
      rowActions: [
        { key: 'edit', label: 'Edit', icon: Edit, onClick: handleEditVenue },
        { key: 'website', label: 'Visit Website', icon: ExternalLink, onClick: (v) => window.open(v.website!, '_blank'), visible: (v) => !!v.website },
        { key: 'delete', label: 'Delete', icon: Trash2, variant: 'destructive', onClick: handleDeleteVenue },
      ],
      toolbarActions: (
        <div className="flex gap-1 flex-wrap">
          {(['foursquare', 'tripadvisor', 'tomtom', 'google-places'] as const).map((provider) => (
            <Button key={provider} variant="secondary" size="sm" disabled={!!isImporting[provider]} style={{ fontSize: '0.75rem' }} onClick={() => setImportDialog({ open: true, provider })}>
              <Search style={{ height: 12, width: 12, marginRight: 4 }} />
              {isImporting[provider] ? 'Importing...' : provider.charAt(0).toUpperCase() + provider.slice(1).replace('-', ' ')}
            </Button>
          ))}
          <VenuesCsvImport onImportComplete={refetch} />
          <ExportExcelButton onExport={handleExportExcel} />
          <Button size="sm" onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}>
            <Plus style={{ height: 14, width: 14, marginRight: 4 }} />
            Add Venue
          </Button>
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, isImporting],
  );

  return (
    <AdminEntityTable
      title="Venues Management"
      subtitle={`Manage venues and locations (${venueCategories.length} categories)`}
      backHref={null}
      config={tableConfig}
      afterTable={
        <>
          <VenueEditDialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
            formData={formData}
            setFormData={setFormData}
            isEditing={!!editingVenue}
            isEnriching={isEnrichingVenue}
            onSubmit={handleSubmit}
            onEnrich={handleEnrichVenue}
            onAddressComponents={handleAddressComponents}
          />

          {importDialog.provider && (
            <VenueImportDialog
              open={importDialog.open}
              onOpenChange={(open) => setImportDialog({ open, provider: importDialog.provider })}
              provider={importDialog.provider}
              onImport={handleImportDialogSubmit}
              isImporting={!!isImporting[importDialog.provider]}
            />
          )}

          <VenueEnrichmentPreview
            isOpen={showEnrichmentPreview}
            onClose={() => setShowEnrichmentPreview(false)}
            results={enrichmentResults}
            onSelectResult={handleSelectEnrichmentResult}
            venueName={enrichmentVenueName}
          />
        </>
      }
    />
  );
}
