import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/integrations/api/client";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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

      const { data, error } = await api.functions.invoke('import-events-csv', {
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
      <DialogContent sx={{ maxWidth: 448 }}>
        <DialogHeader>
          <DialogTitle>Import Events from CSV</DialogTitle>
        </DialogHeader>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              sx={{ mt: 0.5 }}
            />
          </Box>

          <Typography variant="body2" color="text.secondary">
            CSV should include columns: title, description, event_type, venue_name, address, city, state, country, start_date, end_date, price_min, price_max, is_free, max_attendees, age_restriction, website, ticket_url, organizer_name, organizer_contact, featured
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download style={{ height: 16, width: 16, marginRight: 8 }} />
              Download Template
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || isUploading}
            >
              {isUploading ? "Importing..." : "Import Events"}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
