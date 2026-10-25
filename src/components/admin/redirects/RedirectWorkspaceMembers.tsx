import { useRedirectMembers, type RedirectMember as Member } from '@/hooks/useRedirectMembers';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
async function request(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  const { data, error } = await supabase.functions.invoke('redirect-api/members' + path, {
    method,
    ...(body ? { body } : {}),
  });
  if (error || data?.error)
    throw new Error(data?.error ?? error?.message ?? 'Could not manage workspace members');
  return data;
}
export function RedirectWorkspaceMembers() {
  const { user } = useAuth();
  return <MemberEditor key={user?.id ?? 'signed-out'} />;
}
function MemberEditor() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const client = useQueryClient();
  const [label, setLabel] = useState(''),
    [userId, setUserId] = useState('');
  const [kind, setKind] = useState<Member['kind']>('user'),
    [role, setRole] = useState<Member['role']>('member');
  const [removing, setRemoving] = useState<string | null>(null);
  const members = useRedirectMembers();
  const change = useMutation({
    mutationFn: ({ id, values, remove }: { id?: string; values?: unknown; remove?: boolean }) =>
      request(id ? '/' + id : '', remove ? 'DELETE' : id ? 'PATCH' : 'POST', values),
    onSuccess: async (_data, variables) => {
      if (!alive.current) return;
      if (!variables.id) {
        setLabel('');
        setUserId('');
      }
      setRemoving(null);
      await client.invalidateQueries({ queryKey: ['redirect-workspace-members'] });
      await client.invalidateQueries({ queryKey: ['redirect-folder-access'] });
    },
  });
  return (
    <section aria-label="Workspace members" className="space-y-4 rounded-container border p-4">
      <h3 className="font-semibold">Workspace members</h3>
      <p className="text-sm text-muted-foreground">
        Add an existing account or a machine identity. Folder defaults apply immediately. This
        grants access only to the link workspace.
      </p>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate({ values: { label, kind, role, ...(kind === 'user' ? { userId } : {}) } });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="member-label">Name</Label>
          <Input
            id="member-label"
            required
            maxLength={100}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="member-kind">Identity</Label>
          <select
            id="member-kind"
            className="block w-full rounded-element border bg-background p-2"
            value={kind}
            onChange={(e) => setKind(e.target.value as Member['kind'])}
          >
            <option value="user">Existing account</option>
            <option value="machine">Machine</option>
          </select>
        </div>
        {kind === 'user' && (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="member-user-id">Account UUID</Label>
            <Input
              id="member-user-id"
              required
              pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Use the ID of an existing registered account.
            </p>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="member-role">Workspace role</Label>
          <select
            id="member-role"
            className="block w-full rounded-element border bg-background p-2"
            value={role}
            onChange={(e) => setRole(e.target.value as Member['role'])}
          >
            <option value="member">Member</option>
            <option value="viewer">Viewer (read only)</option>
            <option value="billing">Billing (links read only)</option>
          </select>
        </div>
        <Button type="submit" className="self-end" disabled={change.isPending || !label.trim()}>
          {change.isPending ? 'Saving…' : 'Add member'}
        </Button>
      </form>
      {change.isError && (
        <p role="alert" className="text-destructive">
          {change.error.message}
        </p>
      )}
      {members.isPending && <p role="status">Loading members…</p>}
      {members.isError && (
        <p role="alert">
          {members.error.message}{' '}
          <Button variant="outline" size="sm" onClick={() => void members.refetch()}>
            Retry
          </Button>
        </p>
      )}
      <ul className="divide-y">
        {(!members.isError ? members.data : [])?.map((member) => (
          <li key={member.id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">{member.label}</span>
                <p className="text-xs text-muted-foreground">
                  {member.isWorkspaceOwner
                    ? 'Owner account'
                    : member.kind === 'machine'
                      ? 'Machine'
                      : 'Account'}{' '}
                  · {member.role} · {member.active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label={'Role for ' + member.label}
                  className="rounded-element border bg-background p-2 text-sm"
                  value={member.role}
                  disabled={change.isPending || member.isWorkspaceOwner}
                  onChange={(event) =>
                    change.mutate({
                      id: member.id,
                      values: { role: event.target.value },
                    })
                  }
                >
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                  <option value="billing">Billing (links read only)</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={change.isPending || member.isWorkspaceOwner}
                  onClick={() =>
                    change.mutate({ id: member.id, values: { active: !member.active } })
                  }
                >
                  {member.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={member.isWorkspaceOwner}
                  onClick={() => setRemoving(member.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
            {member.isWorkspaceOwner && (
              <p className="text-sm text-muted-foreground">
                Remove explicit Owner access in Workspace Owners before changing this membership
                role or status.
              </p>
            )}
            {removing === member.id && !member.isWorkspaceOwner && (
              <div className="space-y-2">
                <p className="text-sm">
                  Remove this membership, folder overrides, and all bound API credentials?
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={change.isPending}
                    onClick={() => change.mutate({ id: member.id, remove: true })}
                  >
                    Confirm removal
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {members.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No members added. Workspace administrators retain full access.
        </p>
      )}
    </section>
  );
}
