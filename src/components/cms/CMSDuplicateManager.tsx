import { useState } from 'react';
import { AlertTriangle, Check, X, Eye, Merge, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export function CMSDuplicateManager() {
  const [duplicateCandidates] = useState([
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

  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const pendingCandidates = duplicateCandidates.filter(c => c.status === 'pending');
  const reviewedCandidates = duplicateCandidates.filter(c => c.status !== 'pending');

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-red-600';
    if (score >= 0.8) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'merged': return 'bg-green-100 text-green-800 border-green-200';
      case 'not_duplicate': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'deferred': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleDecision = (candidateId: string, decision: string) => {
    console.log(`Decision for ${candidateId}: ${decision}`);
    // In production, this would call the CMS API
  };

  const CandidateComparison = ({ candidate }: { candidate: any }) => (
    <div className="space-y-6">
      {/* Similarity Score */}
      <div className="text-center">
        <div className={`text-3xl font-bold ${getScoreColor(candidate.similarity_score)}`}>
          {Math.round(candidate.similarity_score * 100)}%
        </div>
        <p className="text-sm text-muted-foreground">Similarity Score</p>
        <Progress value={candidate.similarity_score * 100} className="mt-2" />
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Original Content</CardTitle>
            <CardDescription>
              Created {new Date(candidate.content_1.created_at).toLocaleDateString()} • 
              Source: {candidate.content_1.source}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Title</Label>
                <p className="text-sm">{Object.values(candidate.content_1.title)[0] as string}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Type</Label>
                <Badge variant="outline" className="capitalize">
                  {candidate.content_1.content_type}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Potential Duplicate</CardTitle>
            <CardDescription>
              Created {new Date(candidate.content_2.created_at).toLocaleDateString()} • 
              Source: {candidate.content_2.source}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">Title</Label>
                <p className="text-sm">{Object.values(candidate.content_2.title)[0] as string}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Type</Label>
                <Badge variant="outline" className="capitalize">
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
          <CardTitle className="text-lg">Matching Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Title Similarity</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {Math.round(candidate.matching_criteria.title_similarity * 100)}%
                </span>
                {candidate.matching_criteria.title_similarity > 0.8 ? 
                  <Check className="h-4 w-4 text-green-500" /> : 
                  <X className="h-4 w-4 text-red-500" />
                }
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm">Location Match</span>
              {candidate.matching_criteria.location_match ? 
                <Check className="h-4 w-4 text-green-500" /> : 
                <X className="h-4 w-4 text-red-500" />
              }
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm">Date Overlap</span>
              {candidate.matching_criteria.date_overlap ? 
                <Check className="h-4 w-4 text-green-500" /> : 
                <X className="h-4 w-4 text-red-500" />
              }
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm">External ID Match</span>
              {candidate.matching_criteria.external_id_match ? 
                <Check className="h-4 w-4 text-green-500" /> : 
                <X className="h-4 w-4 text-red-500" />
              }
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decision Actions */}
      {candidate.status === 'pending' && (
        <div className="space-y-4">
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
              className="flex-1"
            >
              <Merge className="h-4 w-4 mr-2" />
              Merge Items
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleDecision(candidate.id, 'not_duplicate')}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Duplicate Detection</h2>
          <p className="text-muted-foreground">Review and manage potential duplicate content</p>
        </div>
        <Button variant="outline">
          <RotateCcw className="h-4 w-4 mr-2" />
          Run Detection
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCandidates.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Auto-Merged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {reviewedCandidates.filter(c => c.status === 'merged').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Not Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {reviewedCandidates.filter(c => c.status === 'not_duplicate').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deferred</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">
              {reviewedCandidates.filter(c => c.status === 'deferred').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pending">Pending Review ({pendingCandidates.length})</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed ({reviewedCandidates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingCandidates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No pending duplicates</h3>
                <p className="text-muted-foreground">All potential duplicates have been reviewed</p>
              </CardContent>
            </Card>
          ) : (
            pendingCandidates.map((candidate) => (
              <Card key={candidate.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        Potential Duplicate Detected
                        <Badge className={`${getScoreColor(candidate.similarity_score)} border`}>
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
                        <div className="font-medium">
                          "{Object.values(candidate.content_1.title)[0] as string}"
                        </div>
                        <div className="text-sm text-muted-foreground">vs</div>
                        <div className="font-medium">
                          "{Object.values(candidate.content_2.title)[0] as string}"
                        </div>
                      </div>
                    </div>
                    
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button>
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
        </TabsContent>

        <TabsContent value="reviewed" className="space-y-4">
          {reviewedCandidates.map((candidate) => (
            <Card key={candidate.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Badge className={getStatusColor(candidate.status)}>
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Content 1:</span>
                    <span className="font-medium">"{Object.values(candidate.content_1.title)[0] as string}"</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Content 2:</span>
                    <span className="font-medium">"{Object.values(candidate.content_2.title)[0] as string}"</span>
                  </div>
                  {candidate.decision_reason && (
                    <div className="mt-3 p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Decision Reason:</p>
                      <p className="text-sm">{candidate.decision_reason}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}