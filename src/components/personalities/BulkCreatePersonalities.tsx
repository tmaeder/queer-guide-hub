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

export const BulkCreatePersonalities = () => {
  const [names, setNames] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ created: any[], errors: any[] } | null>(null);
  const { toast } = useToast();

  const validateNames = (namesList: string[]) => {
    const validationErrors = [];
    const validNames = [];
    
    for (const name of namesList) {
      if (name.length < 2) {
        validationErrors.push(`"${name}" is too short (minimum 2 characters)`);
      } else if (name.length > 100) {
        validationErrors.push(`"${name}" is too long (maximum 100 characters)`);
      } else if (!/^[a-zA-Z\s\-\.\(\)]+$/.test(name)) {
        validationErrors.push(`"${name}" contains invalid characters`);
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
      
      if (validationErrors.length > 0) {
        toast({
          title: "Validation Errors Found",
          description: `${validationErrors.length} names have validation issues. Check the details below.`,
          variant: "destructive",
        });
        
        setResults({
          created: [],
          errors: validationErrors.map(error => ({ name: 'Validation', error }))
        });
        return;
      }

      if (validNames.length === 0) {
        toast({
          title: "No Valid Names",
          description: "All provided names failed validation",
          variant: "destructive",
        });
        return;
      }

      // Set progress tracking
      setProgress({ current: 0, total: validNames.length });

      toast({
        title: "Processing Started",
        description: `Processing ${validNames.length} personalities...`,
      });

      const { data, error } = await supabase.functions.invoke('bulk-create-personalities', {
        body: { names: validNames }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to create personalities');
      }

      if (!data) {
        throw new Error('No response data received from server');
      }

      const createdCount = data.created || 0;
      const errorCount = Array.isArray(data.errorDetails) ? data.errorDetails.length : 0;
      
      // Store results for display
      setResults({
        created: data.results || [],
        errors: data.errorDetails || []
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Bulk Create Personalities
          </CardTitle>
          <CardDescription>
            Enter personality names (one per line) to automatically create entries enriched with Wikipedia data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Albert Einstein&#10;Marie Curie&#10;Leonardo da Vinci&#10;..."
              value={names}
              onChange={(e) => setNames(e.target.value)}
              rows={8}
              className="resize-none"
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
          
          {isLoading && progress.total > 0 && (
            <div className="space-y-2">
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
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Personalities...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
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
                <RefreshCw className="mr-2 h-4 w-4" />
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
            <CardTitle className="flex items-center gap-2">
              {results.created.length > 0 && results.errors.length === 0 && (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              {results.created.length > 0 && results.errors.length > 0 && (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              {results.created.length === 0 && results.errors.length > 0 && (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Results Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                {results.created.length} Created
              </Badge>
              {results.errors.length > 0 && (
                <Badge variant="outline" className="text-red-600 border-red-600">
                  <XCircle className="w-3 h-3 mr-1" />
                  {results.errors.length} Failed
                </Badge>
              )}
            </div>

            {results.created.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start">
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                    Successfully Created ({results.created.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {results.created.map((personality: any, index: number) => (
                    <div key={index} className="text-sm p-2 bg-green-50 rounded border-l-4 border-green-500">
                      <div className="font-medium">{personality.name}</div>
                      {personality.profession && (
                        <div className="text-muted-foreground">{personality.profession}</div>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {results.errors.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start">
                    <XCircle className="mr-2 h-4 w-4 text-red-500" />
                    Failed Imports ({results.errors.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {results.errors.map((error: any, index: number) => (
                    <div key={index} className="text-sm p-2 bg-red-50 rounded border-l-4 border-red-500">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{error.name}</div>
                          <div className="text-muted-foreground mt-1">{error.error}</div>
                        </div>
                        <Badge variant="secondary" className="ml-2">
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
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Tips for better results:</strong>
          <ul className="mt-2 space-y-1 text-sm list-disc list-inside">
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