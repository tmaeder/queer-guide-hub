import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Tag, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function TagCategorizer() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    categorized: number;
    message: string;
  } | null>(null);

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
      toast.error(`Categorization Failed: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Tag style={{ width: 20, height: 20 }} />
          Tag Categorization
        </CardTitle>
        <CardDescription>
          Automatically categorize all uncategorized tags using AI
        </CardDescription>
      </CardHeader>
      <CardContent>
        {progress && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm">Progress</p>
              <p className="text-sm">{progress.categorized} / {progress.total}</p>
            </div>
            <Progress value={(progress.categorized / progress.total) * 100} />
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <p className="text-sm text-muted-foreground">{progress.message}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button onClick={handleCategorizeAll} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Categorizing...
              </>
            ) : (
              <>
                <Tag className="w-4 h-4" />
                Categorize All Tags
              </>
            )}
          </Button>

          {isRunning && (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <p className="text-sm text-muted-foreground">This may take several minutes for large tag sets</p>
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          This will analyze all uncategorized tags and assign them to appropriate categories using AI.
          Tags will be categorized into: Consent, Genders, Sexual Orientations, Romantic Orientations,
          Relationships, Roles, Gay Culture, Kink Activities, Sexual Activities, Philia, Toys & Equipment,
          Play Spaces, Events, Holidays, Sexual Health, Mental Health, Scene Safety, and Safety Resources.
        </p>
      </CardContent>
    </Card>
  );
}
