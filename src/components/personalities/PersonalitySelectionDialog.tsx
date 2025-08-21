import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User } from "lucide-react";

interface Candidate {
  id: string;
  title: string;
  description: string;
}

interface PersonalitySelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: Candidate[];
  searchTerm: string;
  onSelect: (candidate: Candidate) => void;
  loading?: boolean;
}

export function PersonalitySelectionDialog({ 
  open, 
  onOpenChange, 
  candidates, 
  searchTerm,
  onSelect,
  loading = false
}: PersonalitySelectionDialogProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const handleSelect = () => {
    if (selectedCandidate) {
      onSelect(selectedCandidate);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Multiple Results Found</DialogTitle>
          <p className="text-muted-foreground">
            Found {candidates.length} potential matches for "{searchTerm}". Please select the correct person:
          </p>
        </DialogHeader>
        
        <div className="space-y-3">
          {candidates.map((candidate) => (
            <Card 
              key={candidate.id}
              className={`cursor-pointer transition-colors ${
                selectedCandidate?.id === candidate.id 
                  ? 'ring-2 ring-primary bg-accent/50' 
                  : 'hover:bg-accent/30'
              }`}
              onClick={() => setSelectedCandidate(candidate)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{candidate.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {candidate.description}
                    </CardDescription>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      selectedCandidate?.id === candidate.id 
                        ? 'bg-primary border-primary' 
                        : 'border-muted-foreground'
                    }`} />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedCandidate || loading}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Processing...' : 'Select Person'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}