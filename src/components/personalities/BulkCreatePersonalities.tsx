import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus } from "lucide-react";

export const BulkCreatePersonalities = () => {
  const [names, setNames] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleBulkCreate = async () => {
    if (!names.trim()) {
      toast({
        title: "Error",
        description: "Please enter personality names separated by lines",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const namesList = names.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);

      if (namesList.length === 0) {
        toast({
          title: "Error",
          description: "No valid names found",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('bulk-create-personalities', {
        body: { names: namesList }
      });

      if (error) throw error;

      toast({
        title: "Bulk Creation Complete",
        description: `Created ${data.created} personalities. ${data.errors} errors occurred.`,
      });

      if (data.errors > 0) {
        console.log('Errors:', data.errors);
      }

      // Clear the textarea on success
      setNames("");
      
    } catch (error) {
      console.error('Error creating personalities:', error);
      toast({
        title: "Error",
        description: "Failed to create personalities",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
        <Textarea
          placeholder="Albert Einstein&#10;Marie Curie&#10;Leonardo da Vinci&#10;..."
          value={names}
          onChange={(e) => setNames(e.target.value)}
          rows={8}
          className="resize-none"
        />
        <Button 
          onClick={handleBulkCreate} 
          disabled={isLoading || !names.trim()}
          className="w-full"
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
      </CardContent>
    </Card>
  );
};