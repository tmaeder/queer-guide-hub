import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { Loader2, Sparkles, CheckCircle, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface BulkCreateResult {
  term: string;
  status: 'created' | 'exists' | 'error';
  tag?: Record<string, unknown>;
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

  const handleSubmit = async () => {
    if (!terms.trim()) {
      toast.error('Error: Please enter some terms to create tags');
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
        toast.error('Error: No valid terms found');
        return;
      }

      const { data, error } = await supabase.functions.invoke('bulk-create-ai-tags', {
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
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'created':
        return <CheckCircle className="w-4 h-4" style={{ color: 'var(--success)' }} />;
      case 'exists':
        return <AlertCircle className="w-4 h-4" style={{ color: 'var(--warning)' }} />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'created':
        return <Badge variant="default">Created</Badge>;
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
        <Button variant="outline">
          <Sparkles className="w-4 h-4 mr-2" />
          AI Bulk Create
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Sparkles className="w-5 h-5 inline-block mr-2" />
            AI-Powered Bulk Tag Creation
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Enter terms (one per line)</p>
            <Textarea
              placeholder={"pride\nrainbow flag\ncoming out\ndrag show\nqueer history"}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              style={{ minHeight: 128, resize: 'none' }}
              disabled={isLoading}
            />
            <span className="text-xs text-muted-foreground">
              Each term will be automatically categorized and enhanced with AI-generated descriptions using Wikipedia and OpenAI.
            </span>
          </div>

          {results.length > 0 && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium mb-2">Results:</p>
              <div className="border border-border rounded-sm overflow-auto max-h-64">
                <div className="flex flex-col gap-2 p-3">
                  {results.map((result, index) => (
                    <div key={index} className="flex items-start justify-between gap-3 p-2 bg-muted rounded-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <p className="text-sm font-medium truncate">{result.term}</p>
                          {getStatusBadge(result.status)}
                        </div>
                        {result.category && (
                          <span className="text-xs text-muted-foreground mt-1 block">
                            Category: {result.category}
                          </span>
                        )}
                        {result.image_url && (
                          <div className="mt-1">
                            <img src={result.image_url} alt={result.term} className="w-16 h-12 object-cover rounded mt-1" />
                          </div>
                        )}
                        {result.description && (
                          <span className="text-xs text-muted-foreground mt-1 overflow-hidden line-clamp-2 block">
                            {result.description}
                          </span>
                        )}
                        {result.wikipedia_url && (
                          <a
                            href={result.wikipedia_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs inline-flex items-center gap-1 mt-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Wikipedia
                          </a>
                        )}
                        {result.error && (
                          <span className="text-xs text-destructive mt-1 block">
                            Error: {result.error}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Tags with AI
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkCreateAITags;
