import { Check, Bookmark, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import {
  useEntityMarks,
  useTogglePlaceMark,
  type PlaceMarkEntity,
  type PlaceMarkKind,
} from '@/hooks/usePlaceMarks';
import { useToast } from '@/hooks/use-toast';

interface Props {
  entityType: PlaceMarkEntity;
  entityId: string;
  kind?: PlaceMarkKind;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const LABELS: Record<PlaceMarkKind, { on: string; off: string; Icon: typeof Check }> = {
  visited: { on: 'Visited', off: 'Mark visited', Icon: Check },
  saved: { on: 'Saved', off: 'Save', Icon: Bookmark },
  contributed: { on: 'Contributed', off: 'Contributed', Icon: Check },
};

export function MarkVisitedButton({
  entityType,
  entityId,
  kind = 'visited',
  size = 'default',
  className,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: marks } = useEntityMarks(entityType, entityId);
  const toggle = useTogglePlaceMark();

  const active = !!marks?.some((m) => m.mark_type === kind);
  const { on, off, Icon } = LABELS[kind];

  if (!user) return null;

  return (
    <Button
      type="button"
      size={size}
      variant={active ? 'default' : 'outline'}
      className={className}
      disabled={toggle.isPending}
      onClick={() =>
        toggle.mutate(
          { entity_type: entityType, entity_id: entityId, mark_type: kind },
          {
            onSuccess: ({ removed }) =>
              toast({
                title: removed ? `Removed from ${kind}` : `Marked ${kind}`,
                description: 'Private to your footprint.',
              }),
            onError: (e: unknown) =>
              toast({
                title: 'Could not save',
                description: e instanceof Error ? e.message : 'Try again',
                variant: 'destructive',
              }),
          },
        )
      }
      aria-pressed={active}
    >
      {toggle.isPending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Icon className="h-4 w-4 mr-2" />
      )}
      {active ? on : off}
    </Button>
  );
}
