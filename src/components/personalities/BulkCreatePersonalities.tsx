import { useState } from "react";
import { Box, Typography } from '@mui/material';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, AlertCircle, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const BulkCreatePersonalities = () => {
  const [names, setNames] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ created: any[], errors: any[] } | null>(null);
  const [sources, setSources] = useState({
    wikidata: true,
    wikipedia: true,
    openLibrary: true,
    bandsintown: true,
    pexelsImages: true
  });
  const { toast } = useToast();

  const validateNames = (namesList: string[]) => {
    const validationErrors = [];
    const validNames = [];

    for (const name of namesList) {
      if (name.length < 2) {
        validationErrors.push(`"${name}" is too short (minimum 2 characters) - skipped`);
      } else if (name.length > 100) {
        validationErrors.push(`"${name}" is too long (maximum 100 characters) - skipped`);
      } else if (!new RegExp("^[\\p{L}\\p{M}\\p{N}\\s\\-.'()\":,&;]+$", "u").test(name)) {
        validationErrors.push(`"${name}" contains invalid characters - skipped`);
      } else {
        validNames.push(name);
      }
    }

    return { validNames, validationErrors };
  };

  const handleBulkCreate = async () => {
    // Reset previous results
    setResults(null);

    if (!names.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter personality names separated by lines",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setProgress({ current: 0, total: 0 });

    try {
      const namesList = names.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);

      if (namesList.length === 0) {
        toast({
          title: "Validation Error",
          description: "No valid names found after filtering",
          variant: "destructive",
        });
        return;
      }

      // Validate names
      const { validNames, validationErrors } = validateNames(namesList);

      if (validNames.length === 0) {
        toast({
          title: "No Valid Names",
          description: "All provided names failed validation",
          variant: "destructive",
        });

        setResults({
          created: [],
          errors: validationErrors.map(error => ({ name: 'Validation', error }))
        });
        return;
      }

      if (validationErrors.length > 0) {
        toast({
          title: "Processing Valid Names",
          description: `Skipping ${validationErrors.length} invalid names, processing ${validNames.length} valid names`,
        });
      }

      // Set progress tracking
      setProgress({ current: 0, total: validNames.length });

      toast({
        title: "Processing Started",
        description: `Processing ${validNames.length} personalities...`,
      });

      console.log('Calling bulk-create-personalities with:', { names: validNames, sources });

      let data, error;
      try {
        const response = await supabase.functions.invoke('bulk-create-personalities', {
          body: { names: validNames, sources }
        });
        data = response.data;
        error = response.error;
      } catch (invokeError) {
        console.error('Network error calling edge function:', invokeError);
        throw new Error(`Network error: ${invokeError.message || 'Failed to send request to the Edge Function'}`);
      }

      console.log('Function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to create personalities');
      }

      if (!data) {
        throw new Error('No response data received from server');
      }

      if (!data.success) {
        throw new Error(data.error || 'Function returned error');
      }

      const createdCount = data.created || 0;
      const errorCount = Array.isArray(data.errorDetails) ? data.errorDetails.length : 0;

      // Store results for display, including validation errors
      setResults({
        created: data.results || [],
        errors: [
          ...validationErrors.map(error => ({ name: 'Validation', error })),
          ...(data.errorDetails || [])
        ]
      });

      // Show completion message
      if (createdCount > 0 && errorCount === 0) {
        toast({
          title: "✅ All Personalities Created",
          description: `Successfully created ${createdCount} personalities`,
        });
        setNames(""); // Clear on full success
      } else if (createdCount > 0 && errorCount > 0) {
        toast({
          title: "⚠️ Partial Success",
          description: `Created ${createdCount} personalities, ${errorCount} failed`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "❌ Creation Failed",
          description: `No personalities created. ${errorCount} errors occurred`,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Error creating personalities:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      toast({
        title: "System Error",
        description: `Failed to process request: ${errorMessage}`,
        variant: "destructive",
      });

      setResults({
        created: [],
        errors: [{ name: 'System Error', error: errorMessage }]
      });
    } finally {
      setIsLoading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const retryFailedItems = () => {
    if (!results?.errors) return;

    const failedNames = results.errors
      .filter(err => err.name !== 'Validation' && err.name !== 'System Error')
      .map(err => err.name)
      .join('\n');

    setNames(failedNames);
    setResults(null);
  };

  const getErrorCategory = (error: string) => {
    if (error.includes('schema cache') || error.includes('column')) return 'Database Schema';
    if (error.includes('No data found')) return 'Not Found';
    if (error.includes('already exists')) return 'Duplicate';
    if (error.includes('Validation')) return 'Validation';
    return 'Unknown';
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card>
        <CardHeader>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Plus sx={{ height: '20px', width: '20px' }} />
            Bulk Create Personalities
          </CardTitle>
          <CardDescription>
            Enter personality names (one per line) to automatically create entries enriched with Wikipedia data
          </CardDescription>
        </CardHeader>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Textarea
                placeholder="Albert Einstein&#10;Marie Curie&#10;Leonardo da Vinci&#10;..."
                value={names}
                onChange={(e) => setNames(e.target.value)}
                rows={8}
                sx={{ resize: 'none' }}
                disabled={isLoading}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem', color: 'text.secondary' }}>
                <Typography component="span">
                  {names.split('\n').filter(name => name.trim().length > 0).length} names entered
                </Typography>
                {names.trim() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNames("")}
                    disabled={isLoading}
                  >
                    Clear
                  </Button>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Data Sources</Label>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="wikidata"
                    checked={sources.wikidata}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, wikidata: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="wikidata" sx={{ fontSize: '0.875rem' }}>Wikidata (core data)</Label>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="wikipedia"
                    checked={sources.wikipedia}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, wikipedia: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="wikipedia" sx={{ fontSize: '0.875rem' }}>Wikipedia (bio)</Label>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="openLibrary"
                    checked={sources.openLibrary}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, openLibrary: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="openLibrary" sx={{ fontSize: '0.875rem' }}>Open Library (books)</Label>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="bandsintown"
                    checked={sources.bandsintown}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, bandsintown: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="bandsintown" sx={{ fontSize: '0.875rem' }}>Bandsintown (concerts)</Label>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="pexelsImages"
                    checked={sources.pexelsImages}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, pexelsImages: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="pexelsImages" sx={{ fontSize: '0.875rem' }}>Pexels (fallback images)</Label>
                </Box>
              </Box>
            </Box>
          </Box>

          {isLoading && progress.total > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <Typography component="span">Processing personalities...</Typography>
                <Typography component="span">{progress.current}/{progress.total}</Typography>
              </Box>
              <Progress value={(progress.current / progress.total) * 100} />
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              onClick={handleBulkCreate}
              disabled={isLoading || !names.trim()}
              sx={{ flex: 1 }}
            >
              {isLoading ? (
                <>
                  <Loader2 sx={{ mr: 1, height: '16px', width: '16px' }} />
                  Creating Personalities...
                </>
              ) : (
                <>
                  <Plus sx={{ mr: 1, height: '16px', width: '16px' }} />
                  Create Personalities
                </>
              )}
            </Button>

            {results?.errors && results.errors.length > 0 && (
              <Button
                variant="outline"
                onClick={retryFailedItems}
                disabled={isLoading}
              >
                <RefreshCw sx={{ mr: 1, height: '16px', width: '16px' }} />
                Retry Failed
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Results Display */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {results.created.length > 0 && results.errors.length === 0 && (
                <CheckCircle sx={{ height: '20px', width: '20px', color: 'success.main' }} />
              )}
              {results.created.length > 0 && results.errors.length > 0 && (
                <AlertCircle sx={{ height: '20px', width: '20px', color: 'warning.main' }} />
              )}
              {results.created.length === 0 && results.errors.length > 0 && (
                <XCircle sx={{ height: '20px', width: '20px', color: 'error.main' }} />
              )}
              Results Summary
            </CardTitle>
          </CardHeader>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Badge variant="outline" sx={{ color: 'success.main', borderColor: 'success.main' }}>
                <CheckCircle sx={{ width: '12px', height: '12px', mr: 0.5 }} />
                {results.created.length} Created
              </Badge>
              {results.errors.length > 0 && (
                <Badge variant="outline" sx={{ color: 'error.main', borderColor: 'error.main' }}>
                  <XCircle sx={{ width: '12px', height: '12px', mr: 0.5 }} />
                  {results.errors.length} Failed
                </Badge>
              )}
            </Box>

            {results.created.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" sx={{ width: '100%', justifyContent: 'flex-start' }}>
                    <CheckCircle sx={{ mr: 1, height: '16px', width: '16px', color: 'success.main' }} />
                    Successfully Created ({results.created.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                  {results.created.map((personality: any, index: number) => (
                    <Box key={index} sx={{ fontSize: '0.875rem', p: 1, bgcolor: 'success.light', borderRadius: 1, borderLeft: 4, borderColor: 'success.main' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        {personality.image_url && (
                          <Box
                            component="img"
                            src={personality.image_url}
                            alt={personality.name}
                            sx={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{personality.name}</Typography>
                          {personality.profession && (
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{personality.profession}</Typography>
                          )}
                          {personality.nationality && (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{personality.nationality}</Typography>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {results.errors.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" sx={{ width: '100%', justifyContent: 'flex-start' }}>
                    <XCircle sx={{ mr: 1, height: '16px', width: '16px', color: 'error.main' }} />
                    Failed Imports ({results.errors.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                  {results.errors.map((error: any, index: number) => (
                    <Box key={index} sx={{ fontSize: '0.875rem', p: 1, bgcolor: 'error.light', borderRadius: 1, borderLeft: 4, borderColor: 'error.main' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{error.name}</Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{error.error}</Typography>
                        </Box>
                        <Badge variant="secondary" sx={{ ml: 1 }}>
                          {getErrorCategory(error.error)}
                        </Badge>
                      </Box>
                    </Box>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Help Information */}
      <Alert>
        <AlertCircle sx={{ height: '16px', width: '16px' }} />
        <AlertDescription>
          <Typography component="strong">Tips for better results:</Typography>
          <Box component="ul" sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.875rem', listStylePosition: 'inside' }}>
            <Box component="li">Use full names (e.g., "Marie Curie" instead of just "Curie")</Box>
            <Box component="li">Include middle names or suffixes if the person is commonly known by them</Box>
            <Box component="li">For disambiguation, add context (e.g., "Peter Allen (musician)")</Box>
            <Box component="li">One name per line, avoid special characters except hyphens, periods, and parentheses</Box>
          </Box>
        </AlertDescription>
      </Alert>
    </Box>
  );
};
