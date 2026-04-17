import { useState } from 'react';
import { Box, Typography } from '@mui/material';
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
          <Typography sx={{ color: 'text.secondary' }}>
            Found {candidates.length} potential matches for "{searchTerm}". Please select the correct person:
          </Typography>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {candidates.map((candidate) => (
            <Card
              key={candidate.id}

              onClick={() => setSelectedCandidate(candidate)}
            >
              <CardHeader>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ mt: 0.5 }}>
                    <User />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <CardTitle>{candidate.title}</CardTitle>
                    <CardDescription>
                      {candidate.description}
                    </CardDescription>

                    {candidate.details && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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
                              <Box component="span" sx={{ color: 'success.main' }}>• Living</Box>
                            )}
                          </Badge>
                        )}

                        {candidate.details.nationality && (
                          <Badge variant="outline">
                            <MapPin />
                            {candidate.details.nationality}
                          </Badge>
                        )}
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: 2,
                      borderColor: selectedCandidate?.id === candidate.id ? 'primary.main' : 'text.secondary',
                      bgcolor: selectedCandidate?.id === candidate.id ? 'primary.main' : 'transparent'
                    }} />
                  </Box>
                </Box>
              </CardHeader>
            </Card>
          ))}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, pt: 2 }}>
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

          >
            {loading && <Loader2 />}
            {loading ? 'Processing...' : 'Select Person'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
