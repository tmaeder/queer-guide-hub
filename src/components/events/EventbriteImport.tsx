import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Loader2 } from "lucide-react";
import Box from '@mui/material/Box';

interface EventbriteImportProps {
  onImportComplete?: () => void;
}

export const EventbriteImport = ({ onImportComplete }: EventbriteImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const { toast } = useToast();

  const categories = [
    { id: "103", name: "Music" },
    { id: "110", name: "Food & Drink" },
    { id: "113", name: "Community & Culture" },
    { id: "105", name: "Performing & Visual Arts" },
    { id: "104", name: "Film, Media & Entertainment" },
    { id: "108", name: "Sports & Fitness" },
    { id: "102", name: "Science & Technology" },
    { id: "101", name: "Business & Professional" },
    { id: "111", name: "Charity & Causes" },
    { id: "115", name: "Religion & Spirituality" },
    { id: "116", name: "Government & Politics" },
    { id: "112", name: "Seasonal & Holiday" },
    { id: "109", name: "Health & Wellness" },
    { id: "107", name: "Hobbies & Special Interest" },
    { id: "114", name: "Other" }
  ];

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
      const { data, error } = await supabase.functions.invoke('import-eventbrite-events', {
        body: {
          query: query.trim(),
          location: location.trim() || undefined,
          categoryId: categoryId || undefined
        }
      });

      if (error) throw error;

      toast({
        title: "Import successful",
        description: `Successfully imported ${data.imported} events from Eventbrite`
      });

      setIsOpen(false);
      setQuery("");
      setLocation("");
      setCategoryId("");
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
          <Calendar style={{ height: 16, width: 16, marginRight: 8 }} />
          Import from Eventbrite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Events from Eventbrite</DialogTitle>
        </DialogHeader>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Label htmlFor="query">Search Query *</Label>
            <Input
              id="query"
              placeholder="e.g., LGBTQ+, Pride, Drag Show"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Box>

          <Box>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g., New York, NY or Berlin, Germany"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Box>

          <Box>
            <Label htmlFor="category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select category (optional)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
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
                  <Loader2 style={{ height: 16, width: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
                  Importing...
                </>
              ) : (
                "Import Events"
              )}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
