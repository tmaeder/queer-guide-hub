import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { timeAgo } from '@/utils/timezone';
import { kanbanColumns, priorities, type KanbanStatus } from './constants';
import type { AdminProfile, FeedbackResolution } from './types';

interface Props {
  status: string;
  priority: number;
  assigneeId: string | null;
  resolution: FeedbackResolution | null;
  resolvedAt: string | null;
  admins: AdminProfile[];
  onStatusChange: (status: KanbanStatus) => void;
  onPriorityChange: (priority: number) => void;
  onAssign: (assigneeId: string | null) => void;
  onResolutionChange: (resolution: FeedbackResolution | null) => void;
}

export function DrawerTriageBar({
  status,
  priority,
  assigneeId,
  resolution,
  resolvedAt,
  admins,
  onStatusChange,
  onPriorityChange,
  onAssign,
  onResolutionChange,
}: Props) {
  const assignee = assigneeId ? admins.find((a) => a.user_id === assigneeId) : null;

  return (
    <div className="grid grid-cols-2 gap-3 mb-5">
      <div>
        <span className="text-xs font-semibold block mb-1">Status</span>
        <Select
          value={status || 'new'}
          onValueChange={(v) => onStatusChange(v as KanbanStatus)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kanbanColumns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="inline-flex items-center">
                  <span
                    className="inline-block mr-2"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: c.color,
                      borderRadius: '50%',
                    }}
                  />
                  {c.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <span className="text-xs font-semibold block mb-1">Priority</span>
        <Select
          value={String(priority ?? 2)}
          onValueChange={(v) => onPriorityChange(Number(v))}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorities.map((p) => (
              <SelectItem key={p.value} value={String(p.value)}>
                <span className="inline-flex items-center">
                  <span
                    className="inline-block mr-2"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: p.color,
                      borderRadius: '50%',
                    }}
                  />
                  {p.short} · {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <span className="text-xs font-semibold block mb-1">Assignee</span>
        <Select
          value={assigneeId ?? '__unassigned__'}
          onValueChange={(v) => onAssign(v === '__unassigned__' ? null : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unassigned__">
              <em>Unassigned</em>
            </SelectItem>
            {admins.map((a) => (
              <SelectItem key={a.user_id} value={a.user_id}>
                <span className="inline-flex items-center">
                  <Avatar style={{ width: 16, height: 16, marginRight: 6, fontSize: '0.6rem' }}>
                    {a.avatar_url && <AvatarImage src={a.avatar_url} alt="" />}
                    <AvatarFallback>{(a.display_name || '?').slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  {a.display_name || a.user_id.slice(0, 8)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assignee && (
          <span className="text-xs text-muted-foreground mt-0.5 block">
            Assigned to {assignee.display_name || assignee.user_id.slice(0, 8)}
          </span>
        )}
      </div>

      <div>
        <span className="text-xs font-semibold block mb-1">
          Resolution {resolvedAt && `(${timeAgo(resolvedAt)})`}
        </span>
        <Select
          value={resolution ?? '__none__'}
          onValueChange={(v) =>
            onResolutionChange(v === '__none__' ? null : (v as FeedbackResolution))
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__"><em>Not resolved</em></SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="wontfix">Won't fix</SelectItem>
            <SelectItem value="duplicate">Duplicate</SelectItem>
            <SelectItem value="invalid">Invalid</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
