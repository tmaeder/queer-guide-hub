import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface VenuesCsvImportProps {
  onImportComplete?: () => void;
}

export const VenuesCsvImport = ({ onImportComplete }: VenuesCsvImportProps) => {
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

      const { data, error } = await supabase.functions.invoke('import-venues-csv', {
        body: formData
      });

      if (error) throw error;

      toast({
        title: "Import successful",
        description: `Successfully imported ${data.imported} venues`
      });

      setIsOpen(false);
      setFile(null);
      onImportComplete?.();
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: "Failed to import venues from CSV. Please check the file format.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = `name,description,category,address,city,state,country,postal_code,latitude,longitude,phone,website,email,instagram,price_range,tags,amenities,verified,featured
The Blue Note,Famous jazz club in Greenwich Village,club,131 W 3rd St,New York,NY,US,10012,40.7308,-74.0014,+1-212-475-8592,https://bluenote.net,info@bluenote.net,@bluenotenyc,3,"jazz;live music;cocktails","WiFi;Air Conditioning;Live Music",true,true
Central Park Cafe,Cozy cafe overlooking Central Park,cafe,2 E 60th St,New York,NY,US,10022,40.7589,-73.9759,+1-212-371-4000,https://centralparkrest.com,info@centralparkrest.com,@centralparkcafe,2,"coffee;breakfast;outdoor seating","WiFi;Outdoor Seating;Pet Friendly",false,false`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'venues_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload style={{ width: 16, height: 16, marginRight: 8 }} />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent sx={{ maxWidth: '28rem' }}>
        <DialogHeader>
          <DialogTitle>Import Venues from CSV</DialogTitle>
        </DialogHeader>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              sx={{ mt: 1 }}
            />
          </Box>

          <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            <Typography variant="body2">CSV should include columns: name, description, category, address, city, state, country, postal_code, latitude, longitude, phone, website, email, instagram, price_range, tags, amenities, verified, featured</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>Required fields: name, category, address, city, country</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>Tags and amenities can be semicolon-separated (e.g., "tag1;tag2;tag3")</Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download style={{ width: 16, height: 16, marginRight: 8 }} />
              Download Template
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || isUploading}
            >
              {isUploading ? "Importing..." : "Import Venues"}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};