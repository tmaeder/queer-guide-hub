import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Sparkles, CheckCircle, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'exists':
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'created':
        return <Badge variant="default" className="bg-success text-success-foreground">Created</Badge>;
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
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          AI Bulk Create
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI-Powered Bulk Tag Creation
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Enter terms (one per line)
            </label>
            <Textarea
              placeholder="pride&#10;rainbow flag&#10;coming out&#10;drag show&#10;queer history"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="min-h-32 resize-none"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Each term will be automatically categorized and enhanced with AI-generated descriptions using Wikipedia and OpenAI.
            </p>
          </div>

          {results.length > 0 && (
            <div className="flex-1 overflow-hidden">
              <h3 className="font-medium mb-2">Results:</h3>
              <div className="border rounded-md overflow-auto max-h-64">
                <div className="space-y-2 p-3">
                  {results.map((result, index) => (
                    <div key={index} className="flex items-start justify-between gap-3 p-2 bg-muted/50 rounded">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <span className="font-medium truncate">{result.term}</span>
                          {getStatusBadge(result.status)}
                        </div>
                        {result.category && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Category: {result.category}
                          </div>
                        )}
                        {result.image_url && (
                          <div className="text-xs text-muted-foreground mt-1">
                            <img src={result.image_url} alt={result.term} className="w-16 h-12 object-cover rounded mt-1" />
                          </div>
                        )}
                        {result.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {result.description}
                          </div>
                        )}
                        {result.wikipedia_url && (
                          <a
                            href={result.wikipedia_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Wikipedia
                          </a>
                        )}
                        {result.error && (
                          <div className="text-xs text-destructive mt-1">
                            Error: {result.error}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
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
              className="gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Tags with AI
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkCreateAITags;