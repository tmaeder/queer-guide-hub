import { RedirectWorkspaceOwnership } from './RedirectWorkspaceOwnership';
import { RedirectNativeApps } from './RedirectNativeApps';
import { RedirectInvitations } from '@/components/admin/redirects/RedirectInvitations';
import { RedirectIntegrationSetup } from './RedirectIntegrationSetup';
import { RedirectWebhooks } from './RedirectWebhooks';
import { RedirectQrStyleSettings } from './RedirectQrStyleSettings';
import { RedirectDomains } from './RedirectDomains';
import { RedirectWorkspaceMembers } from './RedirectWorkspaceMembers';
import { RedirectFolderAccess } from './RedirectFolderAccess';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CAMPAIGN_FIELDS, type CampaignFields } from '@/lib/redirects/linkTools';
import { useRedirectWorkspace, type WorkspaceResource } from '@/hooks/useRedirectWorkspace';

const TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

export function RedirectWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const workspace = useRedirectWorkspace();
  const [showMembers, setShowMembers] = useState(false);
  const [showDomains, setShowDomains] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [showQrStyle, setShowQrStyle] = useState(false);
  const [showWebhooks, setShowWebhooks] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [accessFolder, setAccessFolder] = useState<string | null>(null);
  const [kind, setKind] = useState<WorkspaceResource>('folders');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('gray');
  const [campaign, setCampaign] = useState<CampaignFields>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const reset = () => {
    setAccessFolder(null);
    setName('');
    setEditing(null);
    setDeleting(null);
    setCampaign({});
    setColor('gray');
    workspace.resource.reset();
  };
  const rows = workspace.data?.[kind] ?? [];
  const submit = async () => {
    await workspace.resource.mutateAsync({
      kind,
      id: editing ?? undefined,
      values: {
        name: name.trim(),
        ...(kind === 'tags' ? { color } : {}),
        ...(kind === 'templates' ? { parameters: campaign } : {}),
      },
    });
    reset();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link workspace</DialogTitle>
          <DialogDescription>
            Shared folders, colored tags, and campaign templates for your team.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Workspace resources">
          {(['folders', 'tags', 'templates'] as WorkspaceResource[]).map((value) => (
            <Button
              key={value}
              variant={kind === value ? 'default' : 'outline'}
              size="sm"
              aria-pressed={kind === value}
              onClick={() => {
                reset();
                setKind(value);
              }}
            >
              {value === 'templates' ? 'UTM templates' : value === 'folders' ? 'Folders' : 'Tags'}
            </Button>
          ))}
        </div>
        <Button variant="outline" onClick={() => setShowMembers(!showMembers)}>
          {showMembers ? 'Hide members' : 'Manage members'}
        </Button>
        <Button variant="outline" asChild>
          <a href="/links-workspace">Open member workspace</a>
        </Button>
        {showMembers && (
          <>
            <RedirectWorkspaceOwnership />
            <RedirectWorkspaceMembers />
            <RedirectInvitations />
          </>
        )}
        <Button variant="outline" onClick={() => setShowDomains(!showDomains)}>
          {showDomains ? 'Hide domains' : 'Manage custom domains'}
        </Button>
        {showDomains && <RedirectDomains />}
        <Button variant="outline" onClick={() => setShowApps(!showApps)}>
          {showApps ? 'Hide native apps' : 'Manage native apps'}
        </Button>
        {showApps && <RedirectNativeApps />}
        <Button variant="outline" onClick={() => setShowQrStyle(!showQrStyle)}>
          {showQrStyle ? 'Hide saved QR style' : 'Manage saved QR style'}
        </Button>
        {showQrStyle && <RedirectQrStyleSettings />}
        <Button variant="outline" onClick={() => setShowWebhooks(!showWebhooks)}>
          {showWebhooks ? 'Hide webhooks' : 'Manage outgoing webhooks'}
        </Button>
        {showWebhooks && <RedirectWebhooks />}
        <Button variant="outline" onClick={() => setShowIntegrations(!showIntegrations)}>
          {showIntegrations
            ? 'Hide conversion integrations'
            : 'Set up Segment or Google Tag Manager'}
        </Button>
        {showIntegrations && <RedirectIntegrationSetup />}
        {workspace.isError && (
          <div role="alert">
            <p>Could not load the link workspace. {workspace.error.message}</p>
            <Button variant="outline" onClick={() => void workspace.refetch()}>
              Retry workspace
            </Button>
          </div>
        )}
        {workspace.isPending && <p role="status">Loading workspace…</p>}
        {workspace.data && (
          <>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit().catch(() => {});
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="resource-name">
                  {kind === 'templates'
                    ? 'Template name'
                    : kind === 'folders'
                      ? 'Folder name'
                      : 'Tag name'}
                </Label>
                <Input
                  id="resource-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                />
              </div>
              {kind === 'tags' && (
                <div className="space-y-2">
                  <Label htmlFor="tag-color">Tag color</Label>
                  <select
                    id="tag-color"
                    className="rounded-element border bg-background p-2 text-sm"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  >
                    {TAG_COLORS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
              )}
              {kind === 'templates' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {CAMPAIGN_FIELDS.map((key) => (
                    <div className="space-y-2" key={key}>
                      <Label htmlFor={`template-${key}`}>
                        {key === 'ref' ? 'Referral' : key.replace('utm_', '')}
                      </Label>
                      <Input
                        id={`template-${key}`}
                        value={campaign[key] ?? ''}
                        onChange={(event) =>
                          setCampaign({ ...campaign, [key]: event.target.value })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              {workspace.resource.isError && (
                <p role="alert" className="text-destructive">
                  {workspace.resource.error.message}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={workspace.resource.isPending || !name.trim()}>
                  {workspace.resource.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create'}
                </Button>
                {editing && (
                  <Button type="button" variant="outline" onClick={reset}>
                    Cancel edit
                  </Button>
                )}
              </div>
            </form>
            {accessFolder && (
              <RedirectFolderAccess
                key={accessFolder}
                folderId={accessFolder}
                onClose={() => setAccessFolder(null)}
              />
            )}
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t py-2"
                >
                  <span className="font-medium">{row.name}</span>
                  <div className="flex flex-wrap gap-2">
                    {kind === 'folders' && (
                      <Button variant="ghost" size="sm" onClick={() => setAccessFolder(row.id)}>
                        Access
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        reset();
                        setEditing(row.id);
                        setName(row.name);
                        if ('color' in row) setColor(row.color);
                        if ('parameters' in row) setCampaign(row.parameters);
                      }}
                    >
                      Edit
                    </Button>
                    {deleting === row.id ? (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {kind === 'folders'
                            ? 'Links move to Unfiled.'
                            : kind === 'tags'
                              ? 'Tag removed from all links.'
                              : 'Existing links keep their parameters.'}
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={workspace.resource.isPending}
                          onClick={() =>
                            void workspace.resource
                              .mutateAsync({ kind, id: row.id, remove: true })
                              .then(reset)
                              .catch(() => {})
                          }
                        >
                          Confirm delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(row.id)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!rows.length && <p className="text-muted-foreground">No {kind} yet.</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
