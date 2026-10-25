import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
interface Invitation {
  id: string;
  email: string;
  label: string;
  role: string;
  expires_at: string;
  expired: boolean;
  accepted_at: string | null;
  revoked_at: string | null;
}
export function RedirectInvitations() {
  const { user } = useAuth();
  return user ? <InvitationEditor key={user.id} userId={user.id} /> : null;
}
function InvitationEditor({ userId }: { userId: string }) {
  const client = useQueryClient(),
    alive = useRef(true);
  const [email, setEmail] = useState(''),
    [label, setLabel] = useState(''),
    [role, setRole] = useState('viewer'),
    [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const query = useQuery({
    queryKey: ['redirect-invitations', userId],
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const rows: Invitation[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await memberRedirectApi<{ data: Invitation[]; count: number }>(
          '/invitations?offset=' + offset,
          'GET',
          undefined,
          signal,
        );
        rows.push(...page.data);
        if (rows.length >= page.count) return rows;
        if (!page.data.length) throw new Error('Incomplete invitation page');
      }
    },
  });
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async (id?: string) => {
      if (id) {
        await memberRedirectApi('/invitations/' + id, 'DELETE');
        return null;
      }
      return memberRedirectApi<{ invitationUrl: string }>('/invitations', 'POST', {
        email,
        label,
        role,
      });
    },
    onSuccess: async (data) => {
      if (!alive.current) return;
      setLink(data?.invitationUrl ?? null);
      if (data) {
        setEmail('');
        setLabel('');
      }
      await client.invalidateQueries({ queryKey: ['redirect-invitations', userId] });
    },
    onError: () => {
      if (alive.current) {
        setLink(null);
        void query.refetch();
      }
    },
  });
  return (
    <section className="space-y-4 border-t pt-4" aria-label="Workspace invitations">
      <h3 className="font-semibold">Invite a teammate</h3>
      <p className="text-sm">
        Create a link for one verified email address. Share it yourself; no email is sent.
        Invitations expire after seven days.
      </p>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setLink(null);
          mutation.mutate(undefined);
        }}
      >
        <div>
          <Label htmlFor="invite-email">Recipient email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="invite-label">Teammate name</Label>
          <Input
            id="invite-label"
            required
            maxLength={100}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="invite-role">Workspace role</Label>
          <select
            id="invite-role"
            className="block w-full rounded-element border bg-background p-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="viewer">Viewer</option>
            <option value="billing">Billing (links read only)</option>
            <option value="member">Member</option>
          </select>
        </div>
        <Button className="self-end" disabled={mutation.isPending || query.isError}>
          Create invitation
        </Button>
      </form>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      {link && !query.isError && (
        <div className="space-y-2">
          <Label htmlFor="invite-link">Invitation link · shown once</Label>
          <Input id="invite-link" readOnly value={link} />
          <p className="text-sm">
            Save this link now. Creating a new invitation will not recover this link.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setLink(null);
              mutation.reset();
            }}
          >
            Hide invitation link
          </Button>
        </div>
      )}
      {query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        query.data?.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t py-2"
          >
            <p className="break-all">
              {item.label} · {item.email} · {item.role} ·{' '}
              {item.accepted_at
                ? 'Accepted'
                : item.revoked_at
                  ? 'Revoked'
                  : item.expired
                    ? 'Expired'
                    : 'Pending'}
            </p>
            {!item.accepted_at && !item.revoked_at && (
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => {
                  setLink(null);
                  mutation.mutate(item.id);
                }}
              >
                Revoke invitation for {item.email}
              </Button>
            )}
          </div>
        ))
      )}
    </section>
  );
}
export function RedirectInvitationAcceptance({ userId }: { userId: string }) {
  const client = useQueryClient(),
    alive = useRef(true),
    [token, setToken] = useState(
      () => new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '',
    );
  useEffect(() => {
    alive.current = true;
    if (new URLSearchParams(window.location.hash.slice(1)).has('invite'))
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    return () => {
      alive.current = false;
    };
  }, []);
  const inbox = useQuery({
    queryKey: ['redirect-invitation-inbox', userId],
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const rows: {
        id: string;
        label: string;
        role: string;
        expires_at: string;
        workspace?: { id: string; name: string; slug: string };
      }[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await memberRedirectApi<{ data: typeof rows; count: number }>(
          '/invitations/received?offset=' + offset,
          'GET',
          undefined,
          signal,
        );
        rows.push(...page.data);
        if (rows.length >= page.count) return rows;
        if (!page.data.length) throw new Error('Incomplete invitation inbox');
      }
    },
  });
  const accept = useMutation({
    onError: () => {
      if (alive.current)
        void client.invalidateQueries({ queryKey: ['redirect-invitation-inbox', userId] });
    },
    gcTime: 0,
    retry: false,
    mutationFn: async (id?: string) => {
      if (id) return memberRedirectApi('/invitations/accept', 'POST', { id });
      let secret = token.trim();
      if (secret.startsWith('https://')) {
        const url = new URL(secret);
        if (url.origin !== 'https://queer.guide' || url.pathname !== '/links-workspace')
          throw new Error('Choose a Queer Guide workspace invitation');
        secret = new URLSearchParams(url.hash.slice(1)).get('invite') ?? '';
      }
      if (!/^qg_invite_[a-f0-9]{64}$/.test(secret))
        throw new Error('Paste a complete invitation link');
      return memberRedirectApi('/invitations/accept', 'POST', { token: secret });
    },
    onSuccess: async () => {
      if (!alive.current) return;
      setToken('');
      await client.invalidateQueries({ queryKey: ['redirect-member', userId] });
      await client.invalidateQueries({ queryKey: ['redirect-invitation-inbox', userId] });
    },
  });
  return (
    <section
      aria-label="Accept workspace invitation"
      className="space-y-4 rounded-element border p-4"
    >
      <h2 className="font-sans text-title font-bold">Have an invitation?</h2>
      <p className="text-sm">
        Sign in with the verified email address named on the invitation. Existing membership
        permissions stay in place.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate(undefined);
        }}
      >
        <Label htmlFor="accept-invite" className="sr-only">
          Invitation link
        </Label>
        <Input
          id="accept-invite"
          type="text"
          autoComplete="off"
          className="min-w-0 flex-1"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            accept.reset();
          }}
        />
        <Button disabled={accept.isPending || !token}>Accept invitation</Button>
      </form>
      {inbox.isError ? (
        <p role="alert">{inbox.error.message}</p>
      ) : (
        inbox.data?.map((invitation) => (
          <div
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t py-2"
          >
            <p>
              {invitation.workspace && <>{invitation.workspace.name} · </>}
              {invitation.label} · {invitation.role} · expires{' '}
              {new Date(invitation.expires_at).toLocaleDateString()}
            </p>
            <Button
              disabled={accept.isPending}
              variant="outline"
              onClick={() => accept.mutate(invitation.id)}
            >
              Accept invitation for {invitation.label}
            </Button>
          </div>
        ))
      )}
      <p className="text-sm">
        Pending invitations for your current verified email appear here after sign-in. Invitation
        links are never saved in browser storage.
      </p>
      {accept.isError && <p role="alert">{accept.error.message}</p>}
      {accept.isSuccess && <p role="status">Invitation accepted. Workspace access refreshed.</p>}
    </section>
  );
}
