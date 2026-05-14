import { useState } from "react";
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
  const [results, setResults] = useState<{ created: Array<{ name: string; image_url?: string; profession?: string; nationality?: string }>, errors: Array<{ name: string; error: string }> } | null>(null);
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

      setProgress({ current: 0, total: validNames.length });

      toast({
        title: "Processing Started",
        description: `Processing ${validNames.length} personalities...`,
      });

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

      setResults({
        created: data.results || [],
        errors: [
          ...validationErrors.map(error => ({ name: 'Validation', error })),
          ...(data.errorDetails || [])
        ]
      });

      if (createdCount > 0 && errorCount === 0) {
        toast({
          title: "All Personalities Created",
          description: `Successfully created ${createdCount} personalities`,
        });
        setNames("");
      } else if (createdCount > 0 && errorCount > 0) {
        toast({
          title: "Partial Success",
          description: `Created ${createdCount} personalities, ${errorCount} failed`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Creation Failed",
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <Plus />
            Bulk Create Personalities
          </CardTitle>
          <CardDescription>
            Enter personality names (one per line) to automatically create entries enriched with Wikipedia data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Textarea
                placeholder="Albert Einstein&#10;Marie Curie&#10;Leonardo da Vinci&#10;..."
                value={names}
                onChange={(e) => setNames(e.target.value)}
                rows={8}
                disabled={isLoading}
              />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {names.split('\n').filter(name => name.trim().length > 0).length} names entered
                </span>
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
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Label>Data Sources</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="wikidata"
                    checked={sources.wikidata}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, wikidata: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="wikidata">Wikidata (core data)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="wikipedia"
                    checked={sources.wikipedia}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, wikipedia: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="wikipedia">Wikipedia (bio)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="openLibrary"
                    checked={sources.openLibrary}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, openLibrary: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="openLibrary">Open Library (books)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="bandsintown"
                    checked={sources.bandsintown}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, bandsintown: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="bandsintown">Bandsintown (concerts)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pexelsImages"
                    checked={sources.pexelsImages}
                    onCheckedChange={(checked) =>
                      setSources(prev => ({ ...prev, pexelsImages: checked as boolean }))
                    }
                    disabled={isLoading}
                  />
                  <Label htmlFor="pexelsImages">Pexels (fallback images)</Label>
                </div>
              </div>
            </div>
          </div>

          {isLoading && progress.total > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing personalities...</span>
                <span>{progress.current}/{progress.total}</span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleBulkCreate}
              disabled={isLoading || !names.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 />
                  Creating Personalities...
                </>
              ) : (
                <>
                  <Plus />
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
                <RefreshCw />
                Retry Failed
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Display */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>
              {results.created.length > 0 && results.errors.length === 0 && (
                <CheckCircle />
              )}
              {results.created.length > 0 && results.errors.length > 0 && (
                <AlertCircle />
              )}
              {results.created.length === 0 && results.errors.length > 0 && (
                <XCircle />
              )}
              Results Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Badge variant="outline">
                <CheckCircle />
                {results.created.length} Created
              </Badge>
              {results.errors.length > 0 && (
                <Badge variant="outline">
                  <XCircle />
                  {results.errors.length} Failed
                </Badge>
              )}
            </div>

            {results.created.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost">
                    <CheckCircle />
                    Successfully Created ({results.created.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {results.created.map((personality, index: number) => (
                    <div key={index} className="text-sm p-2 rounded border-l-4" style={{ backgroundColor: 'hsl(var(--success) / 0.1)', borderLeftColor: 'hsl(var(--success))' }}>
                      <div className="flex items-start gap-3">
                        {personality.image_url && (
                          <img
                            src={personality.image_url}
                            alt={personality.name}
                            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{personality.name}</p>
                          {personality.profession && (
                            <p className="text-sm text-muted-foreground">{personality.profession}</p>
                          )}
                          {personality.nationality && (
                            <span className="text-xs text-muted-foreground">{personality.nationality}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {results.errors.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost">
                    <XCircle />
                    Failed Imports ({results.errors.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {results.errors.map((error, index: number) => (
                    <div key={index} className="text-sm p-2 rounded border-l-4" style={{ backgroundColor: 'hsl(var(--destructive) / 0.1)', borderLeftColor: 'hsl(var(--destructive))' }}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{error.name}</p>
                          <p className="text-sm text-muted-foreground mt-1">{error.error}</p>
                        </div>
                        <Badge variant="secondary">
                          {getErrorCategory(error.error)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Help Information */}
      <Alert>
        <AlertCircle />
        <AlertDescription>
          <strong>Tips for better results:</strong>
          <ul className="mt-2 flex flex-col gap-1 text-sm" style={{ listStylePosition: 'inside' }}>
            <li>Use full names (e.g., "Marie Curie" instead of just "Curie")</li>
            <li>Include middle names or suffixes if the person is commonly known by them</li>
            <li>For disambiguation, add context (e.g., "Peter Allen (musician)")</li>
            <li>One name per line, avoid special characters except hyphens, periods, and parentheses</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
};
