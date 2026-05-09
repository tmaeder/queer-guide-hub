import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';
import CronEditor, { describeCron } from './CronEditor';

interface ScheduleDialogProps {
  pipelineId: string | undefined;
  currentSchedule: string | null | undefined;
}

export default function ScheduleDialog({ pipelineId, currentSchedule }: ScheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<string | null>(currentSchedule ?? null);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setSchedule(currentSchedule ?? null);
  }, [open, currentSchedule]);

  const save = useMutation({
    mutationFn: async () => {
      if (!pipelineId) throw new Error('No pipeline selected');
      const { error } = await untypedFrom('pipeline_definitions').update({ schedule }).eq('id', pipelineId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Schedule updated: ${describeCron}`);
      qc.invalidateQueries({ queryKey: ['pipeline-definitions'] });
      qc.invalidateQueries({ queryKey: ['unified-pipeline-overview'] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(`Update failed: ${e.message}`),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={!pipelineId}>
              <Calendar className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Edit schedule</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Pipeline schedule
          </DialogTitle>
          <DialogDescription>
            Cron expression controls when the pipeline auto-runs. Leave blank for manual-only.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <CronEditor value={schedule} onChange={setSchedule} />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !pipelineId}>
            {save.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Calendar className="h-3.5 w-3.5 mr-1.5" />}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
