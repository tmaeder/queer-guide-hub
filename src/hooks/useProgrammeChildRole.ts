import { useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { ProgrammeRole } from '@/lib/programmeRoles';

export interface ProgrammeChildPatch {
  childId: string;
  programme_role?: ProgrammeRole | null;
  programme_official?: boolean;
}

/**
 * Writes a festival child's role and official/satellite flag. Admin-only by RLS.
 *
 * Only the two programme columns are ever sent, so this cannot be used to move a child
 * between festivals — re-parenting stays in EventProgrammePanel's attach/detach path.
 * Errors are rethrown for the caller to surface; the CHECK constraint is the authority on
 * which roles exist, and its message is more useful verbatim than paraphrased.
 */
export function useUpdateProgrammeChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ childId, ...patch }: ProgrammeChildPatch) => {
      const { error } = await untypedFrom('events').update(patch).eq('id', childId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-event-programme'] });
      void qc.invalidateQueries({ queryKey: ['event-programme'] });
    },
  });
}
