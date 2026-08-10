import { useState } from "react";
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Ticket } from "lucide-react";

interface TicketmasterImportProps {
  onImportComplete?: () => void;
}

export const TicketmasterImport = ({ onImportComplete }: TicketmasterImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const { toast } = useToast();

  const countries = [
    { code: "US", name: "United States" },
    { code: "CA", name: "Canada" },
    { code: "MX", name: "Mexico" },
    { code: "AU", name: "Australia" },
    { code: "NZ", name: "New Zealand" },
    { code: "GB", name: "United Kingdom" },
    { code: "IE", name: "Ireland" },
    { code: "DE", name: "Germany" },
    { code: "FR", name: "France" },
    { code: "ES", name: "Spain" },
    { code: "IT", name: "Italy" },
    { code: "NL", name: "Netherlands" },
    { code: "BE", name: "Belgium" },
    { code: "AT", name: "Austria" },
    { code: "CH", name: "Switzerland" },
    { code: "DK", name: "Denmark" },
    { code: "SE", name: "Sweden" },
    { code: "NO", name: "Norway" },
    { code: "FI", name: "Finland" }
  ];

  const handleImport = async () => {
    if (!keyword.trim()) {
      toast({
        title: "Error",
        description: "Please enter a search keyword",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // source-ticketmaster searches per keyword within a country and stages
      // into ingestion_staging (source_type 'ticketmaster', same as the
      // retired import-ticketmaster-events fn wrote).
      const { data, error } = await supabase.functions.invoke('source-ticketmaster', {
        body: {
          keywords: [keyword.trim()],
          countryCode
        }
      });

      if (error) throw error;

      toast({
        title: "Staged for review",
        description: `Staged ${data.items ?? 0} Ticketmaster events for the review pipeline`
      });

      setIsOpen(false);
      setKeyword("");
      setCountryCode("US");
      onImportComplete?.();
    } catch (error: unknown) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import events from Ticketmaster",
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
          <Ticket size={16} className="mr-2" />
          Import from Ticketmaster
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Events from Ticketmaster</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="keyword">Search Keyword *</Label>
            <Input
              id="keyword"
              placeholder="e.g., LGBTQ+, Pride, Concert"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="country">Country</Label>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countries.map(country => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              disabled={!keyword.trim() || isLoading}
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
