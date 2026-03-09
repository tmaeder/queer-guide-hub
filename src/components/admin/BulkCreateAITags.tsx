import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Sparkles, CheckCircle, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import { api } from "@/integrations/api/client";
import { Badge } from "@/components/ui/badge";

interface BulkCreateResult {
  term: string;
  status: 'created' | 'exists' | 'error';
  tag?: any;
  category?: string;
  description?: string;
  image_url?: string;
  wikipedia_url?: string;
  error?: string;
}

interface BulkCreateAITagsProps {
  onComplete?: () => void;
}

const BulkCreateAITags: React.FC<BulkCreateAITagsProps> = ({ onComplete }) => {
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BulkCreateResult[]>([]);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!terms.trim()) {
      toast({
        title: "Error",
        description: "Please enter some terms to create tags",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResults([]);

    try {
      const termsList = terms
        .split('\n')
        .map(term => term.trim())
        .filter(term => term.length > 0);

      if (termsList.length === 0) {
        toast({
          title: "Error",
          description: "No valid terms found",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await api.functions.invoke('bulk-create-ai-tags', {
        body: { terms: termsList }
      });

      if (error) {
        throw error;
      }

      setResults(data.results);

      toast({
        title: "Bulk Creation Complete",
        description: `Created ${data.summary.created} tags, ${data.summary.exists} already existed, ${data.summary.errors} errors`,
      });

      if (onComplete) {
        onComplete();
      }

    } catch (error) {
      console.error('Error in bulk create:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create tags",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'created':
        return <CheckCircle style={{ width: 16, height: 16, color: 'var(--success)' }} />;
      case 'exists':
        return <AlertCircle style={{ width: 16, height: 16, color: 'var(--warning)' }} />;
      case 'error':
        return <XCircle style={{ width: 16, height: 16, color: 'var(--destructive)' }} />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'created':
        return <Badge variant="default" sx={{ bgcolor: 'success.main', color: 'success.contrastText' }}>Created</Badge>;
      case 'exists':
        return <Badge variant="secondary">Already Exists</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" sx={{ gap: 1 }}>
          <Sparkles style={{ width: 16, height: 16 }} />
          AI Bulk Create
        </Button>
      </DialogTrigger>
      <DialogContent sx={{ maxWidth: 672, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <DialogHeader>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Sparkles style={{ width: 20, height: 20 }} />
            AI-Powered Bulk Tag Creation
          </DialogTitle>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Enter terms (one per line)
            </Typography>
            <Textarea
              placeholder={"pride\nrainbow flag\ncoming out\ndrag show\nqueer history"}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              style={{ minHeight: 128, resize: 'none' }}
              disabled={isLoading}
            />
            <Typography variant="caption" color="text.secondary">
              Each term will be automatically categorized and enhanced with AI-generated descriptions using Wikipedia and OpenAI.
            </Typography>
          </Box>

          {results.length > 0 && (
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Results:</Typography>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'auto', maxHeight: 256 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5 }}>
                  {results.map((result, index) => (
                    <Box key={index} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getStatusIcon(result.status)}
                          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.term}</Typography>
                          {getStatusBadge(result.status)}
                        </Box>
                        {result.category && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                            Category: {result.category}
                          </Typography>
                        )}
                        {result.image_url && (
                          <Box sx={{ mt: 0.5 }}>
                            <img src={result.image_url} alt={result.term} style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 4, marginTop: 4 }} />
                          </Box>
                        )}
                        {result.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {result.description}
                          </Typography>
                        )}
                        {result.wikipedia_url && (
                          <a
                            href={result.wikipedia_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
                          >
                            <ExternalLink style={{ width: 12, height: 12 }} />
                            Wikipedia
                          </a>
                        )}
                        {result.error && (
                          <Typography variant="caption" color="error.main" sx={{ mt: 0.5 }}>
                            Error: {result.error}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              {results.length > 0 ? 'Close' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !terms.trim()}
              sx={{ gap: 1 }}
            >
              {isLoading && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />}
              Create Tags with AI
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default BulkCreateAITags;
