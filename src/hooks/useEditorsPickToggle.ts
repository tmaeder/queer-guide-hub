import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Admin-only mutation: flip is_editors_pick on a news article. Optimistic;
// reverts on error. Toasts the result so editors see what changed.
export function useEditorsPickToggle(initialValue: boolean) {
  const [value, setValue] = useState<boolean>(initialValue);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const toggle = useCallback(
    async (articleId: string) => {
      const next = !value;
      setValue(next);
      setSaving(true);
      const { error } = await supabase
        .from('news_articles')
        .update({ is_editors_pick: next })
        .eq('id', articleId);
      setSaving(false);
      if (error) {
        setValue(!next);
        toast({
          title: "Couldn't update editor's pick",
          description: error.message,
          variant: 'destructive',
        });
        return null;
      }
      toast({
        title: next ? 'Marked as editor’s pick' : 'Cleared editor’s pick',
      });
      return next;
    },
    [value, toast],
  );

  return { value, saving, toggle };
}
