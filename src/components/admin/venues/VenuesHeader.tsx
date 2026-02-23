import { ArrowLeft, Plus, Download, ChevronDown, RefreshCw, Search } from "lucide-react";
import { ExportExcelButton } from "@/components/admin/ExportExcelButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VenuesCsvImport } from "@/components/venues/VenuesCsvImport";
import { VenueImportDialog } from "./VenueImportDialog";
import { useState } from "react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface VenuesHeaderProps {
  onBack: () => void;
  onAddVenue: () => void;
  onFoursquareImport: (config: any) => void;
  onTripAdvisorImport: (config: any) => void;
  onTomTomImport: (config: any) => void;
  onGooglePlacesImport: (config: any) => void;
  onImportComplete: () => void;
  onExport?: () => Promise<void>;
  isImporting: boolean;
  isImportingTripAdvisor: boolean;
  isImportingTomTom: boolean;
  isImportingGooglePlaces: boolean;
}

export function VenuesHeader({
  onBack,
  onAddVenue,
  onFoursquareImport,
  onTripAdvisorImport,
  onTomTomImport,
  onGooglePlacesImport,
  onImportComplete,
  onExport,
  isImporting,
  isImportingTripAdvisor,
  isImportingTomTom,
  isImportingGooglePlaces
}: VenuesHeaderProps) {
  const [importDialog, setImportDialog] = useState<{
    open: boolean;
    provider: 'foursquare' | 'google-places' | 'tomtom' | 'tripadvisor' | null;
  }>({ open: false, provider: null });

  const handleImportConfig = (config: any) => {
    switch (importDialog.provider) {
      case 'foursquare':
        onFoursquareImport(config);
        break;
      case 'tripadvisor':
        onTripAdvisorImport(config);
        break;
      case 'tomtom':
        onTomTomImport(config);
        break;
      case 'google-places':
        onGooglePlacesImport(config);
        break;
    }
    setImportDialog({ open: false, provider: null });
  };
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, '@media (min-width: 900px)': { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button variant="outline" onClick={onBack} style={{ flexShrink: 0 }}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back to Dashboard
        </Button>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: '-0.025em', fontSize: '1.875rem' }}>Venues Management</Typography>
          <Typography sx={{ color: 'text.secondary' }}>Manage venues and locations</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, '@media (min-width: 900px)': { flexDirection: 'row' } }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={isImporting}
            style={{ fontSize: '0.75rem' }}
            onClick={() => setImportDialog({ open: true, provider: 'foursquare' })}
          >
            <Search style={{ height: 12, width: 12, marginRight: 4 }} />
            {isImporting ? "Importing..." : "Foursquare"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isImportingTripAdvisor}
            style={{ fontSize: '0.75rem' }}
            onClick={() => setImportDialog({ open: true, provider: 'tripadvisor' })}
          >
            <Search style={{ height: 12, width: 12, marginRight: 4 }} />
            {isImportingTripAdvisor ? "Importing..." : "TripAdvisor"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isImportingTomTom}
            style={{ fontSize: '0.75rem' }}
            onClick={() => setImportDialog({ open: true, provider: 'tomtom' })}
          >
            <Search style={{ height: 12, width: 12, marginRight: 4 }} />
            {isImportingTomTom ? "Importing..." : "TomTom"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isImportingGooglePlaces}
            style={{ fontSize: '0.75rem' }}
            onClick={() => setImportDialog({ open: true, provider: 'google-places' })}
          >
            <Search style={{ height: 12, width: 12, marginRight: 4 }} />
            {isImportingGooglePlaces ? "Importing..." : "Google Places"}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <VenuesCsvImport onImportComplete={onImportComplete} />
          {onExport && <ExportExcelButton onExport={onExport} />}
          <Button onClick={onAddVenue}>
            <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
            Add Venue
          </Button>
        </Box>
      </Box>

      {importDialog.provider && (
        <VenueImportDialog
          open={importDialog.open}
          onOpenChange={(open) => setImportDialog({ open, provider: importDialog.provider })}
          provider={importDialog.provider}
          onImport={handleImportConfig}
          isImporting={
            importDialog.provider === 'foursquare' ? isImporting :
            importDialog.provider === 'tripadvisor' ? isImportingTripAdvisor :
            importDialog.provider === 'tomtom' ? isImportingTomTom :
            isImportingGooglePlaces
          }
        />
      )}
    </Box>
  );
}
