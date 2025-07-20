import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Tag, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function TagCategorizer() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    categorized: number;
    message: string;
  } | null>(null);
  const { toast } = useToast();

  const handleCategorizeAll = async () => {
    setIsRunning(true);
    setProgress(null);

    try {
      // Call the categorize-tags edge function
      const { data, error } = await supabase.functions.invoke('categorize-tags', {
        method: 'POST'
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        setProgress({
          total: data.total_tags,
          categorized: data.categorized_count,
          message: data.message
        });

        toast({
          title: "Categorization Complete",
          description: `Successfully categorized ${data.categorized_count} out of ${data.total_tags} tags`,
        });
      } else {
        throw new Error(data.error || 'Categorization failed');
      }
    } catch (error) {
      console.error('Categorization error:', error);
      toast({
        title: "Categorization Failed",
        description: error.message || 'An error occurred during categorization',
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Tag Categorization
        </CardTitle>
        <CardDescription>
          Automatically categorize all uncategorized tags using AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress</span>
              <span>{progress.categorized} / {progress.total}</span>
            </div>
            <Progress 
              value={(progress.categorized / progress.total) * 100} 
              className="w-full"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {progress.message}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button
            onClick={handleCategorizeAll}
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Categorizing...
              </>
            ) : (
              <>
                <Tag className="h-4 w-4" />
                Categorize All Tags
              </>
            )}
          </Button>

          {isRunning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              This may take several minutes for large tag sets
            </div>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          <p>
            This will analyze all uncategorized tags and assign them to appropriate categories using AI.
            Tags will be categorized into: Consent, Genders, Sexual Orientations, Romantic Orientations,
            Relationships, Roles, Gay Culture, Kink Activities, Sexual Activities, Philia, Toys & Equipment,
            Play Spaces, Events, Holidays, Sexual Health, Mental Health, Scene Safety, and Safety Resources.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}