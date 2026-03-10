import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Tag, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/integrations/api/client';

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
      const { data, error } = await api.functions.invoke('categorize-tags', {
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
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tag style={{ width: 20, height: 20 }} />
          Tag Categorization
        </CardTitle>
        <CardDescription>
          Automatically categorize all uncategorized tags using AI
        </CardDescription>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {progress && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2">Progress</Typography>
              <Typography variant="body2">{progress.categorized} / {progress.total}</Typography>
            </Box>
            <Progress
              value={(progress.categorized / progress.total) * 100}
              sx={{ width: '100%' }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircle style={{ width: 16, height: 16, color: '#22c55e' }} />
              <Typography variant="body2" color="text.secondary">{progress.message}</Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            onClick={handleCategorizeAll}
            disabled={isRunning}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            {isRunning ? (
              <>
                <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                Categorizing...
              </>
            ) : (
              <>
                <Tag style={{ width: 16, height: 16 }} />
                Categorize All Tags
              </>
            )}
          </Button>

          {isRunning && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AlertCircle style={{ width: 16, height: 16 }} />
              <Typography variant="body2" color="text.secondary">This may take several minutes for large tag sets</Typography>
            </Box>
          )}
        </Box>

        <Typography variant="body2" color="text.secondary">
          This will analyze all uncategorized tags and assign them to appropriate categories using AI.
          Tags will be categorized into: Consent, Genders, Sexual Orientations, Romantic Orientations,
          Relationships, Roles, Gay Culture, Kink Activities, Sexual Activities, Philia, Toys & Equipment,
          Play Spaces, Events, Holidays, Sexual Health, Mental Health, Scene Safety, and Safety Resources.
        </Typography>
      </CardContent>
    </Card>
  );
}
