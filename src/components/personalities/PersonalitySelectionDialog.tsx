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
      <DialogContent sx={{ maxWidth: '768px', maxHeight: '80vh', overflowY: 'auto' }}>
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
              sx={{
                cursor: 'pointer',
                transition: 'all 0.2s',
                ...(selectedCandidate?.id === candidate.id
                  ? { boxShadow: 2, bgcolor: 'action.selected', outline: 2, outlineColor: 'primary.main' }
                  : { '&:hover': { bgcolor: 'action.hover' } })
              }}
              onClick={() => setSelectedCandidate(candidate)}
            >
              <CardHeader sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{ mt: 0.5 }}>
                    <User sx={{ height: '20px', width: '20px', color: 'text.secondary' }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <CardTitle sx={{ fontSize: '1rem' }}>{candidate.title}</CardTitle>
                    <CardDescription sx={{ mt: 0.5, mb: 1.5 }}>
                      {candidate.description}
                    </CardDescription>

                    {candidate.details && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {candidate.details.profession && (
                          <Badge variant="secondary" sx={{ fontSize: '0.75rem', gap: 0.5 }}>
                            <Briefcase sx={{ height: '12px', width: '12px' }} />
                            {candidate.details.profession}
                          </Badge>
                        )}

                        {(candidate.details.birthYear || candidate.details.deathYear) && (
                          <Badge variant="outline" sx={{ fontSize: '0.75rem', gap: 0.5 }}>
                            <Calendar sx={{ height: '12px', width: '12px' }} />
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
                          <Badge variant="outline" sx={{ fontSize: '0.75rem', gap: 0.5 }}>
                            <MapPin sx={{ height: '12px', width: '12px' }} />
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
            sx={{ gap: 1 }}
          >
            {loading && <Loader2 sx={{ height: '16px', width: '16px' }} />}
            {loading ? 'Processing...' : 'Select Person'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
