import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Ticket, Loader2 } from "lucide-react";

interface TicketmasterImportProps {
  onImportComplete?: () => void;
}

export const TicketmasterImport = ({ onImportComplete }: TicketmasterImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [classificationName, setClassificationName] = useState("");
  const { toast } = useToast();

  const classifications = [
    { value: "Music", label: "Music" },
    { value: "Sports", label: "Sports" },
    { value: "Arts & Theatre", label: "Arts & Theatre" },
    { value: "Film", label: "Film" },
    { value: "Miscellaneous", label: "Miscellaneous" },
    { value: "Undefined", label: "Undefined" }
  ];

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
      const { data, error } = await supabase.functions.invoke('import-ticketmaster-events', {
        body: {
          keyword: keyword.trim(),
          city: city.trim() || undefined,
          countryCode,
          classificationName: classificationName || undefined
        }
      });

      if (error) throw error;

      toast({
        title: "Import successful",
        description: `Successfully imported ${data.imported} events from Ticketmaster`
      });

      setIsOpen(false);
      setKeyword("");
      setCity("");
      setCountryCode("US");
      setClassificationName("");
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
          <Ticket style={{ height: 16, width: 16, marginRight: 8 }} />
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
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              placeholder="e.g., New York, Berlin"
              value={city}
              onChange={(e) => setCity(e.target.value)}
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

          <div>
            <Label htmlFor="classification">Classification</Label>
            <Select value={classificationName} onValueChange={setClassificationName}>
              <SelectTrigger>
                <SelectValue placeholder="Select classification (optional)" />
              </SelectTrigger>
              <SelectContent>
                {classifications.map(classification => (
                  <SelectItem key={classification.value} value={classification.value}>
                    {classification.label}
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
