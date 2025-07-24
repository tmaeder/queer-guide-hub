import { ArrowLeft, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VenuesCsvImport } from "@/components/venues/VenuesCsvImport";

interface VenuesHeaderProps {
  onBack: () => void;
  onAddVenue: () => void;
  onFoursquareImport: () => void;
  onTripAdvisorImport: () => void;
  onTomTomImport: () => void;
  onImportComplete: () => void;
  isImporting: boolean;
  isImportingTripAdvisor: boolean;
  isImportingTomTom: boolean;
}

export function VenuesHeader({ 
  onBack, 
  onAddVenue, 
  onFoursquareImport,
  onTripAdvisorImport,
  onTomTomImport,
  onImportComplete,
  isImporting,
  isImportingTripAdvisor,
  isImportingTomTom
}: VenuesHeaderProps) {
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
            onClick={onFoursquareImport}
            disabled={isImporting}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            {isImporting ? "Importing..." : "Foursquare"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onTripAdvisorImport}
            disabled={isImportingTripAdvisor}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            {isImportingTripAdvisor ? "Importing..." : "TripAdvisor"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onTomTomImport}
            disabled={isImportingTomTom}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            {isImportingTomTom ? "Importing..." : "TomTom"}
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
    </div>
  );
}