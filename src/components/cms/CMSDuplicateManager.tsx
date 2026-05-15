import React, { useState } from 'react';
import { AlertTriangle, Check, X, Eye, Merge, RotateCcw } from 'lucide-react';
import { listFrom } from '@/hooks/usePageFetchers';
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
      let events: Array<{ id: string; title?: string; created_at: string; description?: string }> = [];
      let venues: Array<{ id: string; name?: string; created_at: string; description?: string }> = [];
      try {
        events = await listFrom('events', 'id, title, created_at, description', undefined, 100);
        venues = await listFrom('venues', 'id, name, created_at, description', undefined, 100);
        await listFrom('personalities', 'id, name, created_at, description', undefined, 100);
      } catch (err) {
        console.error('Error fetching content:', err);
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

  const handleDecision = (_candidateId: string, _decision: string) => {
    // TODO: wire to a mutation that records the reviewer decision and
    // applies the merge / split / dismiss action. Was a debug-only
    // console.log.
  };

  const CandidateComparison = ({ candidate }: { candidate: { id: string; type: string; item1: Record<string, unknown>; item2: Record<string, unknown>; similarity_score: number } }) => (
    <div className="flex flex-col gap-6">
      {/* Similarity Score */}
      <div className="text-center">
        <h4 className="text-xl font-bold">
          {Math.round(candidate.similarity_score * 100)}%
        </h4>
        <p className="text-sm text-muted-foreground">Similarity Score</p>
        <Progress value={candidate.similarity_score * 100} />
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Original Content</CardTitle>
            <CardDescription>
              Created {new Date(candidate.content_1.created_at).toLocaleDateString()} •
              Source: {candidate.content_1.source}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div>
                <Label>Title</Label>
                <p className="text-sm">{Object.values(candidate.content_1.title)[0] as string}</p>
              </div>
              <div>
                <Label>Type</Label>
                <Badge variant="outline">
                  {candidate.content_1.content_type}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Potential Duplicate</CardTitle>
            <CardDescription>
              Created {new Date(candidate.content_2.created_at).toLocaleDateString()} •
              Source: {candidate.content_2.source}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div>
                <Label>Title</Label>
                <p className="text-sm">{Object.values(candidate.content_2.title)[0] as string}</p>
              </div>
              <div>
                <Label>Type</Label>
                <Badge variant="outline">
                  {candidate.content_2.content_type}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Matching Criteria */}
      <Card>
        <CardHeader>
          <CardTitle>Matching Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm">Title Similarity</p>
              <div className="flex items-center gap-2">
                <p className="text-sm">
                  {Math.round(candidate.matching_criteria.title_similarity * 100)}%
                </p>
                {candidate.matching_criteria.title_similarity > 0.8 ?
                  <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                  <X style={{ height: 16, width: 16, color: '#ef4444' }} />
                }
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm">Location Match</p>
              {candidate.matching_criteria.location_match ?
                <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                <X style={{ height: 16, width: 16, color: '#ef4444' }} />
              }
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm">Date Overlap</p>
              {candidate.matching_criteria.date_overlap ?
                <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                <X style={{ height: 16, width: 16, color: '#ef4444' }} />
              }
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm">External ID Match</p>
              {candidate.matching_criteria.external_id_match ?
                <Check style={{ height: 16, width: 16, color: '#22c55e' }} /> :
                <X style={{ height: 16, width: 16, color: '#ef4444' }} />
              }
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decision Actions */}
      {candidate.status === 'pending' && (
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="reason">Decision Reason</Label>
            <Textarea
              id="reason"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder="Explain your decision..."
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => handleDecision(candidate.id, 'merge')}

            >
              <Merge style={{ height: 16, width: 16, marginRight: 8 }} />
              Merge Items
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDecision(candidate.id, 'not_duplicate')}

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
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h5 className="text-lg font-semibold">Duplicate Detection</h5>
          <p className="text-sm text-muted-foreground">Review and manage potential duplicate content</p>
        </div>
        <Button
          variant="outline"
          onClick={runDuplicateDetection}
          disabled={isRunningDetection}
        >
          <RotateCcw style={{ height: 16, width: 16, marginRight: 8, ...(isRunningDetection ? { animation: 'spin 1s linear infinite' } : {}) }} />
          {isRunningDetection ? 'Running...' : 'Run Detection'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <h5 className="text-lg font-semibold">{pendingCandidates.length}</h5>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-Merged</CardTitle>
          </CardHeader>
          <CardContent>
            <h5 className="text-lg font-semibold">
              {reviewedCandidates.filter(c => c.status === 'merged').length}
            </h5>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Not Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <h5 className="text-lg font-semibold">
              {reviewedCandidates.filter(c => c.status === 'not_duplicate').length}
            </h5>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deferred</CardTitle>
          </CardHeader>
          <CardContent>
            <h5 className="text-lg font-semibold">
              {reviewedCandidates.filter(c => c.status === 'deferred').length}
            </h5>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending Review ({pendingCandidates.length})</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed ({reviewedCandidates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <div className="flex flex-col gap-4">
            {pendingCandidates.length === 0 ? (
              <Card>
                <CardContent>
                  <Check style={{ height: 48, width: 48, color: '#22c55e', margin: '0 auto 16px' }} />
                  <h6 className="text-base font-semibold">No pending duplicates</h6>
                  <p className="text-sm text-muted-foreground">All potential duplicates have been reviewed</p>
                </CardContent>
              </Card>
            ) : (
              pendingCandidates.map((candidate) => (
                <Card key={candidate.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle>
                          <AlertTriangle style={{ height: 20, width: 20, color: '#eab308' }} />
                          Potential Duplicate Detected
                          <Badge style={{ border: '1px solid' }}>
                            {Math.round(candidate.similarity_score * 100)}% match
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Found {new Date(candidate.created_at).toLocaleString()}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <p>
                            "{Object.values(candidate.content_1.title)[0] as string}"
                          </p>
                          <p className="text-sm text-muted-foreground">vs</p>
                          <p>
                            "{Object.values(candidate.content_2.title)[0] as string}"
                          </p>
                        </div>
                      </div>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button>
                            <Eye style={{ height: 16, width: 16, marginRight: 8 }} />
                            Review
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Review Potential Duplicate</DialogTitle>
                            <DialogDescription>
                              Compare the content items and decide if they should be merged
                            </DialogDescription>
                          </DialogHeader>
                          <CandidateComparison candidate={candidate} />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="reviewed">
          <div className="flex flex-col gap-4">
            {reviewedCandidates.map((candidate) => (
              <Card key={candidate.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle>
                        <Badge style={getStatusStyle(candidate.status)}>
                          {candidate.status.replace('_', ' ')}
                        </Badge>
                        Duplicate Review Completed
                      </CardTitle>
                      <CardDescription>
                        Reviewed {candidate.reviewed_at ? new Date(candidate.reviewed_at).toLocaleString() : 'Unknown'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Content 1:</p>
                      <p>"{Object.values(candidate.content_1.title)[0] as string}"</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Content 2:</p>
                      <p>"{Object.values(candidate.content_2.title)[0] as string}"</p>
                    </div>
                    {candidate.decision_reason && (
                      <div className="mt-3 p-3 bg-muted rounded-element">
                        <p className="text-sm text-muted-foreground">Decision Reason:</p>
                        <p className="text-sm">{candidate.decision_reason}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
