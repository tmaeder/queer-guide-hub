import { ArrowLeft, Plus, Download, ChevronDown, RefreshCw, Search } from "lucide-react";
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

interface VenuesHeaderProps {
  onBack: () => void;
  onAddVenue: () => void;
  onFoursquareImport: (config: any) => void;
  onTripAdvisorImport: (config: any) => void;
  onTomTomImport: (config: any) => void;
  onGooglePlacesImport: (config: any) => void;
  onImportComplete: () => void;
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
    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Venues Management</h1>
          <p className="text-muted-foreground">Manage venues and locations</p>
        </div>
      </div>
      
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={isImporting}
            className="text-xs"
            onClick={() => setImportDialog({ open: true, provider: 'foursquare' })}
          >
            <Search className="h-3 w-3 mr-1" />
            {isImporting ? "Importing..." : "Foursquare"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isImportingTripAdvisor}
            className="text-xs"
            onClick={() => setImportDialog({ open: true, provider: 'tripadvisor' })}
          >
            <Search className="h-3 w-3 mr-1" />
            {isImportingTripAdvisor ? "Importing..." : "TripAdvisor"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isImportingTomTom}
            className="text-xs"
            onClick={() => setImportDialog({ open: true, provider: 'tomtom' })}
          >
            <Search className="h-3 w-3 mr-1" />
            {isImportingTomTom ? "Importing..." : "TomTom"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={isImportingGooglePlaces}
            className="text-xs"
            onClick={() => setImportDialog({ open: true, provider: 'google-places' })}
          >
            <Search className="h-3 w-3 mr-1" />
            {isImportingGooglePlaces ? "Importing..." : "Google Places"}
          </Button>
        </div>
        
        <div className="flex gap-2">
          <VenuesCsvImport onImportComplete={onImportComplete} />
          <Button onClick={onAddVenue}>
            <Plus className="h-4 w-4 mr-2" />
            Add Venue
          </Button>
        </div>
      </div>

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
    </div>
  );
}