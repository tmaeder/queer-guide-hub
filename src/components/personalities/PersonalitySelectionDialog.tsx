import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Calendar, Briefcase, MapPin } from "lucide-react";

interface Candidate {
  id: string;
  title: string;
  description: string;
  details?: {
    birthYear?: string;
    deathYear?: string;
    profession?: string;
    nationality?: string;
    isLiving?: boolean;
  };
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Multiple Results Found</DialogTitle>
          <p className="text-muted-foreground">
            Found {candidates.length} potential matches for "{searchTerm}". Please select the correct person:
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {candidates.map((candidate) => (
            <Card key={candidate.id} onClick={() => setSelectedCandidate(candidate)}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <User />
                  </div>
                  <div className="flex-1">
                    <CardTitle>{candidate.title}</CardTitle>
                    <CardDescription>
                      {candidate.description}
                    </CardDescription>

                    {candidate.details && (
                      <div className="flex flex-wrap gap-2">
                        {candidate.details.profession && (
                          <Badge variant="secondary">
                            <Briefcase />
                            {candidate.details.profession}
                          </Badge>
                        )}

                        {(candidate.details.birthYear || candidate.details.deathYear) && (
                          <Badge variant="outline">
                            <Calendar />
                            {candidate.details.birthYear && candidate.details.deathYear
                              ? `${candidate.details.birthYear}–${candidate.details.deathYear}`
                              : candidate.details.birthYear
                              ? `Born ${candidate.details.birthYear}`
                              : candidate.details.deathYear
                              ? `Died ${candidate.details.deathYear}`
                              : ''
                            }
                            {candidate.details.isLiving && candidate.details.birthYear && (
                              <span style={{ color: 'hsl(var(--success))' }}>• Living</span>
                            )}
                          </Badge>
                        )}

                        {candidate.details.nationality && (
                          <Badge variant="outline">
                            <MapPin />
                            {candidate.details.nationality}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center">
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: '2px solid',
                        borderColor: selectedCandidate?.id === candidate.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                        backgroundColor: selectedCandidate?.id === candidate.id ? 'hsl(var(--primary))' : 'transparent',
                      }}
                    />
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!selectedCandidate || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Processing...' : 'Select Person'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
