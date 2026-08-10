import { useState } from "react";
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "lucide-react";

interface EventbriteImportProps {
  onImportComplete?: () => void;
}

export const EventbriteImport = ({ onImportComplete }: EventbriteImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const { toast } = useToast();

  const handleImport = async () => {
    if (!query.trim()) {
      toast({
        title: "Error",
        description: "Please enter a search query",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // source-eventbrite fans out keywords x cities and stages into
      // ingestion_staging (source_type 'eventbrite', same as the retired
      // import-eventbrite-events fn wrote).
      const { data, error } = await supabase.functions.invoke('source-eventbrite', {
        body: {
          keywords: [query.trim()],
          cities: location.trim() ? [location.trim()] : undefined
        }
      });

      if (error) throw error;

      toast({
        title: "Staged for review",
        description: `Staged ${data.items ?? 0} Eventbrite events for the review pipeline`
      });

      setIsOpen(false);
      setQuery("");
      setLocation("");
      onImportComplete?.();
    } catch (error: unknown) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import events from Eventbrite",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Calendar size={16} className="mr-2" />
          Import from Eventbrite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Events from Eventbrite</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="query">Search Query *</Label>
            <Input
              id="query"
              placeholder="e.g., LGBTQ+, Pride, Drag Show"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g., New York, NY or Berlin, Germany"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              style={{ flex: 1 }}
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              style={{ flex: 1 }}
              onClick={handleImport}
              disabled={!query.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <TrackLoader size={16} className="mr-2" />
                  Importing...
                </>
              ) : (
                "Import Events"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
