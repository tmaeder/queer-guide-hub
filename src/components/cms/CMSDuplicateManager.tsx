import React, { useState } from 'react';
import { AlertTriangle, Check, X, Eye, Merge, RotateCcw } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function CMSDuplicateManager() {
  const [duplicateCandidates, setDuplicateCandidates] = useState([
    {
      id: '1',
      content_id_1: 'content-1',
      content_id_2: 'content-2',
      similarity_score: 0.92,
      status: 'pending',
      matching_criteria: {
        title_similarity: 0.95,
        location_match: true,
        date_overlap: false,
        external_id_match: false,
      },
      content_1: {
        title: { en: 'Pride Festival 2024 - San Francisco' },
        content_type: 'event',
        created_at: '2024-01-10T10:00:00Z',
        source: 'manual',
      },
      content_2: {
        title: { en: 'San Francisco Pride Festival 2024' },
        content_type: 'event',
        created_at: '2024-01-15T14:30:00Z',
        source: 'wikidata',
      },
      created_at: '2024-01-15T15:00:00Z',
    },
    {
      id: '2',
      content_id_1: 'content-3',
      content_id_2: 'content-4',
      similarity_score: 0.87,
      status: 'pending',
      matching_criteria: {
        title_similarity: 0.85,
        location_match: true,
        date_overlap: true,
        external_id_match: false,
      },
      content_1: {
        title: { en: 'Castro Theatre' },
        content_type: 'space',
        created_at: '2024-01-08T16:20:00Z',
        source: 'manual',
      },
      content_2: {
        title: { en: 'The Castro Theatre' },
        content_type: 'space',
        created_at: '2024-01-14T11:45:00Z',
        source: 'openstreetmap',
      },
      created_at: '2024-01-14T12:00:00Z',
    },
    {
      id: '3',
      content_id_1: 'content-5',
      content_id_2: 'content-6',
      similarity_score: 0.94,
      status: 'merged',
      matching_criteria: {
        title_similarity: 0.92,
        location_match: true,
        date_overlap: false,
        external_id_match: true,
      },
      content_1: {
        title: { en: 'Harvey Milk' },
        content_type: 'personality',
        created_at: '2024-01-05T09:30:00Z',
        source: 'manual',
      },
      content_2: {
        title: { en: 'Harvey Bernard Milk' },
        content_type: 'personality',
        created_at: '2024-01-12T13:15:00Z',
        source: 'wikidata',
      },
      created_at: '2024-01-12T14:00:00Z',
      reviewed_at: '2024-01-13T10:30:00Z',
      decision_reason: 'Same person, different name formats. Merged with Wikidata data.',
    },
  ]);

  const [_selectedCandidate, _setSelectedCandidate] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [isRunningDetection, setIsRunningDetection] = useState(false);

  const pendingCandidates = duplicateCandidates.filter(c => c.status === 'pending');
  const reviewedCandidates = duplicateCandidates.filter(c => c.status !== 'pending');

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'error.main';
    if (score >= 0.8) return 'warning.main';
    return 'success.main';
  };

  const getStatusStyle = (status: string): React.CSSProperties => {
    switch (status) {
      case 'pending': return { backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' };
      case 'merged': return { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' };
      case 'not_duplicate': return { backgroundColor: '#dbeafe', color: '#1e40af', borderColor: '#bfdbfe' };
      case 'deferred': return { backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#e5e7eb' };
      default: return { backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#e5e7eb' };
    }
  };

  const runDuplicateDetection = async () => {
    setIsRunningDetection(true);
    try {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, created_at, description')
        .limit(100);

      const { data: venues, error: venuesError } = await supabase
        .from('venues')
        .select('id, name, created_at, description')
        .limit(100);

      const { data: _personalities, error: personalitiesError } = await supabase
        .from('personalities')
        .select('id, name, created_at, description')
        .limit(100);

      if (eventsError || venuesError || personalitiesError) {
        console.error('Error fetching content:', { eventsError, venuesError, personalitiesError });
        toast.error('Failed to fetch content for duplicate detection');
        return;
      }

      const newCandidates: Array<{ id: string; type: string; item1: Record<string, unknown>; item2: Record<string, unknown>; similarity_score: number }> = [];

      if (events) {
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            const event1 = events[i];
            const event2 = events[j];
            const titleSimilarity = calculateTitleSimilarity(event1.title || '', event2.title || '');

            if (titleSimilarity > 0.7) {
              newCandidates.push({
                id: `event-${event1.id}-${event2.id}`,
                content_id_1: event1.id,
                content_id_2: event2.id,
                similarity_score: titleSimilarity,
                status: 'pending',
                matching_criteria: {
                  title_similarity: titleSimilarity,
                  location_match: false,
                  date_overlap: false,
                  external_id_match: false,
                },
                content_1: {
                  title: { en: event1.title || 'Unknown' },
                  content_type: 'event',
                  created_at: event1.created_at,
                  source: 'database',
                },
                content_2: {
                  title: { en: event2.title || 'Unknown' },
                  content_type: 'event',
                  created_at: event2.created_at,
                  source: 'database',
                },
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }

      if (venues) {
        for (let i = 0; i < venues.length; i++) {
          for (let j = i + 1; j < venues.length; j++) {
            const venue1 = venues[i];
            const venue2 = venues[j];
            const nameSimilarity = calculateTitleSimilarity(venue1.name || '', venue2.name || '');

            if (nameSimilarity > 0.7) {
              newCandidates.push({
                id: `venue-${venue1.id}-${venue2.id}`,
                content_id_1: venue1.id,
                content_id_2: venue2.id,
                similarity_score: nameSimilarity,
                status: 'pending',
                matching_criteria: {
                  title_similarity: nameSimilarity,
                  location_match: false,
                  date_overlap: false,
                  external_id_match: false,
                },
                content_1: {
                  title: { en: venue1.name || 'Unknown' },
                  content_type: 'venue',
                  created_at: venue1.created_at,
                  source: 'database',
                },
                content_2: {
                  title: { en: venue2.name || 'Unknown' },
                  content_type: 'venue',
                  created_at: venue2.created_at,
                  source: 'database',
                },
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }

      setDuplicateCandidates(newCandidates);
      toast.success(`Found ${newCandidates.length} potential duplicate${newCandidates.length !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error running duplicate detection:', error);
      toast.error('Failed to run duplicate detection');
    } finally {
      setIsRunningDetection(false);
    }
  };

  const calculateTitleSimilarity = (title1: string, title2: string): number => {
    const words1 = title1.toLowerCase().split(/\s+/);
    const words2 = title2.toLowerCase().split(/\s+/);
    const allWords = new Set([...words1, ...words2]);
    const intersection = words1.filter(word => words2.includes(word));
    return intersection.length / allWords.size;
  };

  const handleDecision = (candidateId: string, decision: string) => {
    console.log(`Decision for ${candidateId}: ${decision}`);
  };

  const CandidateComparison = ({ candidate }: { candidate: { id: string; type: string; item1: Record<string, unknown>; item2: Record<string, unknown>; similarity_score: number } }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Similarity Score */}
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold', color: getScoreColor(candidate.similarity_score) }}>
          {Math.round(candidate.similarity_score * 100)}%
        </Typography>
        <Typography variant="body2" color="text.secondary">Similarity Score</Typography>
        <Progress value={candidate.similarity_score * 100} sx={{ mt: 1 }} />
      </Box>

      {/* Side-by-side comparison */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        <Card>
          <CardHeader>
            <CardTitle sx={{ fontSize: '1.125rem' }}>Original Content</CardTitle>
            <CardDescription>
              Created {new Date(candidate.content_1.created_at).toLocaleDateString()} •
              Source: {candidate.content_1.source}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box>
                <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Title</Label>
                <Typography variant="body2">{Object.values(candidate.content_1.title)[0] as string}</Typography>
              </Box>
              <Box>
                <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Type</Label>
                <Badge variant="outline" sx={{ textTransform: 'capitalize' }}>
                  {candidate.content_1.content_type}
                </Badge>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle sx={{ fontSize: '1.125rem' }}>Potential Duplicate</CardTitle>
            <CardDescription>
              Created {new Date(candidate.content_2.created_at).toLocaleDateString()} •
              Source: {candidate.content_2.source}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box>
                <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Title</Label>
                <Typography variant="body2">{Object.values(candidate.content_2.title)[0] as string}</Typography>
              </Box>
              <Box>
                <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Type</Label>
                <Badge variant="outline" sx={{ textTransform: 'capitalize' }}>
                  {candidate.content_2.content_type}
                </Badge>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Matching Criteria */}
      <Card>
        <CardHeader>
          <CardTitle sx={{ fontSize: '1.125rem' }}>Matching Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">Title Similarity</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {Math.round(candidate.matching_criteria.title_similarity * 100)}%
                </Typography>
                {candidate.matching_criteria.title_similarity > 0.8 ?
                  <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                  <X style={{ height: 16, width: 16, color: '#ef4444' }} />
                }
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">Location Match</Typography>
              {candidate.matching_criteria.location_match ?
                <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                <X style={{ height: 16, width: 16, color: '#ef4444' }} />
              }
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">Date Overlap</Typography>
              {candidate.matching_criteria.date_overlap ?
                <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                <X style={{ height: 16, width: 16, color: '#ef4444' }} />
              }
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">External ID Match</Typography>
              {candidate.matching_criteria.external_id_match ?
                <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                <X style={{ height: 16, width: 16, color: '#ef4444' }} />
              }
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Decision Actions */}
      {candidate.status === 'pending' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Label htmlFor="reason">Decision Reason</Label>
            <Textarea
              id="reason"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder="Explain your decision..."
              rows={3}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={() => handleDecision(candidate.id, 'merge')}
              sx={{ flex: 1 }}
            >
              <Merge style={{ height: 16, width: 16, marginRight: 8 }} />
              Merge Items
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDecision(candidate.id, 'not_duplicate')}
              sx={{ flex: 1 }}
            >
              <X style={{ height: 16, width: 16, marginRight: 8 }} />
              Not Duplicate
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDecision(candidate.id, 'defer')}
            >
              Defer
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Duplicate Detection</Typography>
          <Typography variant="body2" color="text.secondary">Review and manage potential duplicate content</Typography>
        </Box>
        <Button
          variant="outline"
          onClick={runDuplicateDetection}
          disabled={isRunningDetection}
        >
          <RotateCcw style={{ height: 16, width: 16, marginRight: 8, ...(isRunningDetection ? { animation: 'spin 1s linear infinite' } : {}) }} />
          {isRunningDetection ? 'Running...' : 'Run Detection'}
        </Button>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'warning.main' }}>{pendingCandidates.length}</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Auto-Merged</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'success.main' }}>
              {reviewedCandidates.filter(c => c.status === 'merged').length}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Not Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'info.main' }}>
              {reviewedCandidates.filter(c => c.status === 'not_duplicate').length}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Deferred</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
              {reviewedCandidates.filter(c => c.status === 'deferred').length}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <Tabs defaultValue="pending" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TabsList>
          <TabsTrigger value="pending">Pending Review ({pendingCandidates.length})</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed ({reviewedCandidates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pendingCandidates.length === 0 ? (
              <Card>
                <CardContent sx={{ p: 4, textAlign: 'center' }}>
                  <Check style={{ height: 48, width: 48, color: '#22c55e', margin: '0 auto 16px' }} />
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No pending duplicates</Typography>
                  <Typography variant="body2" color="text.secondary">All potential duplicates have been reviewed</Typography>
                </CardContent>
              </Card>
            ) : (
              pendingCandidates.map((candidate) => (
                <Card key={candidate.id}>
                  <CardHeader>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <Box sx={{ flex: 1 }}>
                        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AlertTriangle style={{ height: 20, width: 20, color: '#eab308' }} />
                          Potential Duplicate Detected
                          <Badge style={{ border: '1px solid' }}>
                            {Math.round(candidate.similarity_score * 100)}% match
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Found {new Date(candidate.created_at).toLocaleString()}
                        </CardDescription>
                      </Box>
                    </Box>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box>
                          <Typography sx={{ fontWeight: 500 }}>
                            "{Object.values(candidate.content_1.title)[0] as string}"
                          </Typography>
                          <Typography variant="body2" color="text.secondary">vs</Typography>
                          <Typography sx={{ fontWeight: 500 }}>
                            "{Object.values(candidate.content_2.title)[0] as string}"
                          </Typography>
                        </Box>
                      </Box>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button>
                            <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
                            Review
                          </Button>
                        </DialogTrigger>
                        <DialogContent sx={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
                          <DialogHeader>
                            <DialogTitle>Review Potential Duplicate</DialogTitle>
                            <DialogDescription>
                              Compare the content items and decide if they should be merged
                            </DialogDescription>
                          </DialogHeader>
                          <CandidateComparison candidate={candidate} />
                        </DialogContent>
                      </Dialog>
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        </TabsContent>

        <TabsContent value="reviewed">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {reviewedCandidates.map((candidate) => (
              <Card key={candidate.id}>
                <CardHeader>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box sx={{ flex: 1 }}>
                      <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Badge style={getStatusStyle(candidate.status)}>
                          {candidate.status.replace('_', ' ')}
                        </Badge>
                        Duplicate Review Completed
                      </CardTitle>
                      <CardDescription>
                        Reviewed {candidate.reviewed_at ? new Date(candidate.reviewed_at).toLocaleString() : 'Unknown'}
                      </CardDescription>
                    </Box>
                  </Box>
                </CardHeader>
                <CardContent>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Content 1:</Typography>
                      <Typography sx={{ fontWeight: 500 }}>"{Object.values(candidate.content_1.title)[0] as string}"</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Content 2:</Typography>
                      <Typography sx={{ fontWeight: 500 }}>"{Object.values(candidate.content_2.title)[0] as string}"</Typography>
                    </Box>
                    {candidate.decision_reason && (
                      <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Decision Reason:</Typography>
                        <Typography variant="body2">{candidate.decision_reason}</Typography>
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </TabsContent>
      </Tabs>
    </Box>
  );
}
