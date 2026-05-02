import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface EventsCsvImportProps {
  onImportComplete?: () => void;
}

export const EventsCsvImport = ({ onImportComplete }: EventsCsvImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid file",
        description: "Please select a CSV file",
        variant: "destructive"
      });
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to import",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('import-events-csv', {
        body: formData
      });

      if (error) throw error;

      toast({
        title: "Import successful",
        description: `Successfully imported ${data.imported} events`
      });

      setIsOpen(false);
      setFile(null);
      onImportComplete?.();
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: "Failed to import events from CSV. Please check the file format.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = `title,description,event_type,venue_name,address,city,state,country,start_date,end_date,price_min,price_max,is_free,max_attendees,age_restriction,website,ticket_url,organizer_name,organizer_contact,featured
Summer Music Festival,A great outdoor music festival,festival,Central Park,123 Park Ave,New York,NY,US,2024-07-15T18:00:00Z,2024-07-15T23:00:00Z,25,75,false,1000,18+,https://example.com,https://tickets.example.com,Event Organizers,contact@example.com,false
Tech Conference,Annual technology conference,conference,Convention Center,456 Convention Blvd,San Francisco,CA,US,2024-08-20T09:00:00Z,2024-08-22T17:00:00Z,100,500,false,500,none,https://techconf.example.com,https://tickets.techconf.com,Tech Corp,info@techcorp.com,true`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'events_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload style={{ height: 16, width: 16, marginRight: 8 }} />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Events from CSV</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            CSV should include columns: title, description, event_type, venue_name, address, city, state, country, start_date, end_date, price_min, price_max, is_free, max_attendees, age_restriction, website, ticket_url, organizer_name, organizer_contact, featured
          </p>

          <div className="flex justify-between">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download style={{ height: 16, width: 16, marginRight: 8 }} />
              Download Template
            </Button>
            <Button onClick={handleImport} disabled={!file || isUploading}>
              {isUploading ? "Importing..." : "Import Events"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
