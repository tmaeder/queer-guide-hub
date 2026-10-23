import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Mail, Edit, Eye, Save, Search, Monitor, Smartphone } from 'lucide-react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HtmlDocumentEditor } from '@/components/cms/fields/HtmlDocumentEditor';
import { fetchEmailTemplates, upsertEmailTemplate } from '@/hooks/usePageFetchers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  missingTokens,
  normalizeVariables,
  readBlockDocument,
  renderSample,
  tokensIn,
  type EmailVariable,
} from '@/components/admin/email/emailDocument';

const EmailBlockEditor = lazy(() => import('@/components/admin/email/EmailBlockEditor'));
interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description?: string;
  subject: string;
  html_content: string;
  text_content?: string;
  variables: EmailVariable[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function getRecovery(key: string, selected: EmailTemplate): EmailTemplate | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
    return stored?.id === selected.id &&
      stored?.updated_at === selected.updated_at &&
      typeof stored.html_content === 'string' &&
      typeof stored.subject === 'string' &&
      typeof stored.name === 'string'
      ? { ...selected, ...stored, variables: selected.variables }
      : null;
  } catch {
    return null;
  }
}

export default function EmailTemplates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [blockMode, setBlockMode] = useState(false);
  const [editTab, setEditTab] = useState('content');
  const [convertDialog, setConvertDialog] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [testDialog, setTestDialog] = useState(false);
  const recipient = user?.email?.trim() ?? '';
  const [sending, setSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [recovery, setRecovery] = useState<EmailTemplate | null>(null);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(selected);
  const current = draft ?? selected;
  const recoveryKey = (id: string) => `email-draft:${user?.id ?? 'admin'}:${id}`;
  const converted = !!draft && blockMode && !!selected && !readBlockDocument(selected.html_content);
  const validation =
    draft && selected
      ? [
          ...(!draft.name.trim() ? ['Enter a template name.'] : []),
          ...(!draft.subject.trim() ? ['Enter a subject line.'] : []),
          ...(!draft.html_content.trim() ? ['Add email content.'] : []),
          ...missingTokens(selected.subject, draft.subject).map(
            (name) => `Restore {{${name}}} in the subject.`,
          ),
          ...missingTokens(selected.html_content, draft.html_content).map(
            (name) => `Restore {{${name}}} in the email content.`,
          ),
        ]
      : [];

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await fetchEmailTemplates();
      if (error) throw error;
      setTemplates(
        (data ?? []).map((item) => ({
          ...item,
          variables: normalizeVariables(item.variables),
        })) as EmailTemplate[],
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load synchronizes the template registry with the remote source.
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty && !exportPending) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const followLink = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (
        !anchor ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.href === window.location.href ||
        (url.pathname === window.location.pathname && url.hash)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingAction(() => () => {
        if (url.origin === window.location.origin) navigate(url.pathname + url.search + url.hash);
        else window.location.assign(url.href);
      });
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', followLink, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', followLink, true);
    };
  }, [dirty, exportPending, navigate]);
  useEffect(() => {
    if (!draft) return;
    try {
      const key = `email-draft:${user?.id ?? 'admin'}:${draft.id}`;
      if (dirty) sessionStorage.setItem(key, JSON.stringify(draft));
      else sessionStorage.removeItem(key);
    } catch {
      /* Browser recovery is best effort. */
    }
  }, [dirty, draft, user?.id]);

  const clearRecovery = () => {
    if (selected) {
      try {
        sessionStorage.removeItem(recoveryKey(selected.id));
      } catch {
        /* Storage may be unavailable. */
      }
    }
  };
  const guard = (action: () => void) => {
    if (dirty || exportPending) setPendingAction(() => action);
    else action();
  };
  const selectTemplate = (template: EmailTemplate) => {
    if (template.id === selected?.id) return;
    guard(() => {
      setSelected(template);
      setDraft(null);
      setPreview(false);
      setReviewed(false);
      setSamples({});
      setSaveError(null);
      setExportError(null);
    });
  };
  const startEditing = () => {
    if (!selected) return;
    setEditTab('content');
    const recovered = getRecovery(recoveryKey(selected.id), selected);
    if (recovered) {
      setRecovery(recovered);
      return;
    }
    setDraft({ ...selected });
    setBlockMode(!!readBlockDocument(selected.html_content));
    setSaveError(null);
    setReviewed(false);
  };
  const openPreview = () => {
    setPreview((value) => !value);
    if (!exportPending) setReviewed(true);
  };
  const save = async () => {
    if (
      !draft ||
      !selected ||
      !dirty ||
      saving ||
      exportPending ||
      exportError ||
      validation.length ||
      (converted && !reviewed)
    )
      return;
    setSaving(true);
    setSaveError(null);
    const { id, name, description, subject, html_content, text_content, variables, is_active } =
      draft;
    try {
      const updated_at = new Date().toISOString();
      const { error } = await upsertEmailTemplate(
        {
          name,
          description,
          subject,
          html_content,
          text_content,
          variables,
          is_active,
          updated_by: user?.id,
          updated_at,
        },
        id,
      );
      if (error) throw error;
      const saved = { ...draft, updated_at };
      clearRecovery();
      setTemplates((items) => items.map((item) => (item.id === id ? saved : item)));
      setSelected(saved);
      setDraft(null);
      toast.success('Email template saved');
    } catch {
      setSaveError('Could not save the template. Your draft is preserved. Try saving again.');
    } finally {
      setSaving(false);
    }
  };
  const testVariables = selected
    ? tokensIn(selected.subject + selected.html_content + (selected.text_content ?? ''))
    : [];
  const missingSamples = testVariables.filter((name) => !samples[name]?.trim());
  const sendTest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || dirty || !recipient || missingSamples.length || sending) return;
    setSending(true);
    setTestError(null);
    try {
      const { error } = await supabase.functions.invoke('send-templated-email', {
        body: {
          template_key: selected.template_key,
          to_email: recipient.trim(),
          variables: samples,
          is_test: true,
        },
      });
      if (error) throw error;
      toast.success('Test email accepted', { description: `Queued for delivery to ${recipient}` });
      setTestDialog(false);
    } catch {
      setTestError(
        'Could not send the test email. Use your verified admin email address and try again.',
      );
    } finally {
      setSending(false);
    }
  };
  const sampleFields = (names: string[], prefix: string) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {names.map((name) => (
        <div key={name} className="space-y-1.5">
          <Label htmlFor={`${prefix}-${name}`}>{name}</Label>
          <Input
            id={`${prefix}-${name}`}
            value={samples[name] ?? ''}
            placeholder={
              current?.variables.find((variable) => variable.name === name)?.description ??
              `Sample ${name}`
            }
            onChange={(event) =>
              setSamples((values) => ({ ...values, [name]: event.target.value }))
            }
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminArchetypeHeader title="Email Templates" />
      <p className="text-sm text-muted-foreground">
        Compose, preview and test transactional emails.{' '}
        <a className="underline underline-offset-4" href="/admin/design">
          Manage sender and branding
        </a>
      </p>
      {loading ? (
        <div role="status" className="flex items-center gap-2 py-10">
          <TrackLoader size={24} />
          Loading templates…
        </div>
      ) : loadError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Templates could not be loaded.{' '}
            <Button variant="outline" onClick={load}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside aria-label="Email templates" className="min-w-0 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">Templates</h2>
              <span className="text-sm text-muted-foreground">{templates.length}</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-4" size={16} />
              <Input
                aria-label="Search email templates"
                className="pl-12"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a template"
              />
            </div>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-[70vh]">
              {templates
                .filter((template) =>
                  `${template.name} ${template.template_key}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={template.id === selected?.id}
                    disabled={saving}
                    className={`rounded-element border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${template.id === selected?.id ? 'border-primary bg-accent' : 'border-transparent hover:bg-muted'}`}
                    onClick={() => selectTemplate(template)}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 break-words text-sm font-medium">
                        {template.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {template.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </span>
                    <span className="mt-1 block break-all text-xs text-muted-foreground">
                      {template.template_key}
                    </span>
                  </button>
                ))}
            </div>
            {!templates.length && <AdminEmpty noun="templates" variant="inline" />}
            {!!templates.length &&
              !templates.some((template) =>
                `${template.name} ${template.template_key}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) && (
                <p className="text-sm text-muted-foreground">
                  No matching templates. Try another search.
                </p>
              )}
          </aside>
          <section className="min-w-0" aria-label="Template workspace">
            {!current ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-container border p-6 text-center">
                <Mail size={32} />
                <h2 className="text-base font-medium">Choose an email template</h2>
                <p className="text-sm text-muted-foreground">
                  Select a template to preview its content or start editing.
                </p>
              </div>
            ) : (
              <div className="min-w-0 space-y-6">
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b bg-background py-4">
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-medium">{current.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{current.is_active ? 'Active' : 'Inactive'}</Badge>
                      <span className="text-sm text-muted-foreground" role="status">
                        {draft
                          ? exportPending
                            ? 'Preparing email…'
                            : dirty
                              ? 'Unsaved changes'
                              : 'No changes'
                          : 'Saved template'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={openPreview} disabled={exportPending}>
                      <Eye size={16} className="mr-2" />
                      {preview ? 'Hide preview' : 'Preview'}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={dirty || saving || exportPending || !selected?.is_active}
                      onClick={() => {
                        setTestError(null);
                        setTestDialog(true);
                      }}
                    >
                      Test email
                    </Button>
                    {draft ? (
                      <>
                        <Button
                          variant="outline"
                          disabled={saving}
                          onClick={() =>
                            guard(() => {
                              clearRecovery();
                              setDraft(null);
                              setPreview(false);
                              setExportError(null);
                            })
                          }
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={save}
                          disabled={
                            !dirty ||
                            saving ||
                            exportPending ||
                            !!exportError ||
                            !!validation.length ||
                            (converted && !reviewed)
                          }
                        >
                          {saving ? (
                            <TrackLoader size={16} className="mr-2" />
                          ) : (
                            <Save size={16} className="mr-2" />
                          )}
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button onClick={startEditing}>
                        <Edit size={16} className="mr-2" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                {draft && (
                  <p className="text-sm text-muted-foreground">
                    Test emails use the saved template. Save your changes before sending a test.
                  </p>
                )}
                {!current.is_active && (
                  <p className="text-sm text-muted-foreground">
                    Inactive templates cannot be sent. Activate and save this template to send a
                    test.
                  </p>
                )}
                {saveError && (
                  <Alert variant="destructive">
                    <AlertDescription role="alert">{saveError}</AlertDescription>
                  </Alert>
                )}
                {exportError && (
                  <Alert variant="destructive">
                    <AlertDescription role="alert">{exportError}</AlertDescription>
                  </Alert>
                )}
                {!!validation.length && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <ul>
                        {validation.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {draft ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="space-y-2">
                        <Label htmlFor="template-name">Template name</Label>
                        <Input
                          id="template-name"
                          value={draft.name}
                          disabled={saving}
                          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="template-active">Delivery status</Label>
                        <div className="flex h-12 items-center gap-2">
                          <Switch
                            id="template-active"
                            checked={draft.is_active}
                            disabled={saving}
                            onCheckedChange={(is_active) => setDraft({ ...draft, is_active })}
                          />
                          <span className="text-sm">{draft.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="template-subject">Subject line</Label>
                      <Input
                        id="template-subject"
                        value={draft.subject}
                        disabled={saving}
                        onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                      />
                    </div>
                    <Tabs value={editTab} onValueChange={setEditTab}>
                      <TabsList className="flex w-fit max-w-full flex-wrap h-auto">
                        <TabsTrigger value="content">Email content</TabsTrigger>
                        <TabsTrigger value="text">Plain text</TabsTrigger>
                        <TabsTrigger value="settings">Details & variables</TabsTrigger>
                      </TabsList>
                      <TabsContent
                        value="content"
                        forceMount
                        hidden={editTab !== 'content'}
                        className="space-y-4 data-[state=inactive]:hidden"
                      >
                        {blockMode ? (
                          <>
                            {converted && (
                              <Alert>
                                <AlertDescription>
                                  This is a converted draft. Review its layout in Preview before
                                  saving. The saved template stays intact until you save.
                                </AlertDescription>
                              </Alert>
                            )}
                            <Suspense fallback={<p role="status">Loading block editor…</p>}>
                              <EmailBlockEditor
                                key={draft.id}
                                initialHtml={draft.html_content}
                                disabled={saving}
                                variables={draft.variables}
                                onPending={setExportPending}
                                onError={setExportError}
                                onChange={(html_content, text_content) =>
                                  setDraft((value) =>
                                    value?.id === draft.id
                                      ? { ...value, html_content, text_content }
                                      : value,
                                  )
                                }
                              />
                            </Suspense>
                          </>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-4 rounded-element border p-4">
                              <div>
                                <p className="font-medium">Existing HTML template</p>
                                <p className="text-sm text-muted-foreground">
                                  Convert a draft to add and arrange blocks. Conversion may change
                                  custom styling.
                                </p>
                              </div>
                              <Button onClick={() => setConvertDialog(true)}>
                                Use block editor
                              </Button>
                            </div>
                            <HtmlDocumentEditor
                              label="Existing email content"
                              value={draft.html_content}
                              editable={false}
                            />
                          </>
                        )}
                      </TabsContent>
                      <TabsContent value="text">
                        <div className="space-y-2">
                          <Label htmlFor="template-text">Plain-text alternative</Label>
                          <p className="text-sm text-muted-foreground">
                            Generated from the blocks when you edit the email. You can adjust it
                            here before saving.
                          </p>
                          <Textarea
                            id="template-text"
                            className="min-h-64"
                            value={draft.text_content ?? ''}
                            disabled={saving || exportPending}
                            onChange={(event) =>
                              setDraft({ ...draft, text_content: event.target.value })
                            }
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="settings" className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="template-description">Description</Label>
                          <Textarea
                            id="template-description"
                            value={draft.description ?? ''}
                            disabled={saving}
                            onChange={(event) =>
                              setDraft({ ...draft, description: event.target.value })
                            }
                          />
                        </div>
                        <p className="text-sm">
                          Template key: <code>{draft.template_key}</code>
                        </p>
                        <ul className="space-y-2">
                          {draft.variables.map((variable) => (
                            <li key={variable.name} className="text-sm">
                              <code>{`{{${variable.name}}}`}</code> — {variable.description}
                            </li>
                          ))}
                        </ul>
                        <p className="text-sm text-muted-foreground">
                          Variables are inserted as tokens. Removing a variable used by the saved
                          HTML or subject blocks saving until it is restored.
                        </p>
                      </TabsContent>
                    </Tabs>
                  </>
                ) : (
                  <>
                    <div>
                      <Label>Subject line</Label>
                      <p className="mt-2 break-words text-base">{current.subject}</p>
                    </div>
                    {current.description && (
                      <p className="text-sm text-muted-foreground">{current.description}</p>
                    )}
                    <HtmlDocumentEditor
                      label="Saved email content"
                      value={current.html_content}
                      editable={false}
                    />
                    <details className="text-sm">
                      <summary className="cursor-pointer">Template details</summary>
                      <div className="mt-4 space-y-2">
                        <p>
                          Key: <code>{current.template_key}</code>
                        </p>
                        <p>Updated: {new Date(current.updated_at).toLocaleString()}</p>
                        <ul>
                          {current.variables.map((variable) => (
                            <li key={variable.name}>
                              <code>{`{{${variable.name}}}`}</code> — {variable.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  </>
                )}
                {preview && (
                  <section
                    aria-label="Draft email preview"
                    className="min-w-0 space-y-4 border-t pt-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{draft ? 'Draft preview' : 'Saved preview'}</h3>
                      <div className="flex gap-1">
                        <Button
                          variant={mobile ? 'ghost' : 'secondary'}
                          size="sm"
                          aria-pressed={!mobile}
                          onClick={() => setMobile(false)}
                        >
                          <Monitor size={16} className="mr-2" />
                          Desktop
                        </Button>
                        <Button
                          variant={mobile ? 'secondary' : 'ghost'}
                          size="sm"
                          aria-pressed={mobile}
                          onClick={() => setMobile(true)}
                        >
                          <Smartphone size={16} className="mr-2" />
                          Mobile
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sample values only affect this preview and tests. This previews the content;
                      delivery adds your shared brand header and footer.
                    </p>
                    {sampleFields(
                      tokensIn(
                        current.subject + current.html_content + (current.text_content ?? ''),
                      ),
                      'preview',
                    )}
                    <p className="break-words text-sm">
                      <strong>Subject:</strong> {renderSample(current.subject, samples)}
                    </p>
                    <div
                      className="mx-auto min-w-0 max-w-full transition-[width] motion-reduce:transition-none"
                      style={{ width: mobile ? 375 : 600 }}
                    >
                      <HtmlDocumentEditor
                        label="Email preview"
                        value={renderSample(current.html_content, samples, true)}
                        editable={false}
                      />
                    </div>
                    <details className="text-sm">
                      <summary className="cursor-pointer">Plain-text preview</summary>
                      <pre className="mt-4 whitespace-pre-wrap break-words font-sans">
                        {renderSample(current.text_content ?? '', samples)}
                      </pre>
                    </details>
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      <Dialog open={convertDialog} onOpenChange={setConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to email blocks?</DialogTitle>
            <DialogDescription>
              Creates an editable draft from this template. Custom HTML and styles may change.
              Preview the result before saving; Cancel keeps the original template.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConvertDialog(false)}>
              Keep original
            </Button>
            <Button
              onClick={() => {
                setBlockMode(true);
                setReviewed(false);
                setConvertDialog(false);
              }}
            >
              Convert draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={testDialog} onOpenChange={setTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
            <DialogDescription>
              Uses the saved “{selected?.name}” template. Fill every sample value so the test
              contains no unresolved variables.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={sendTest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-recipient">Recipient email</Label>
              <Input
                id="test-recipient"
                type="email"
                required
                value={recipient}
                readOnly
                disabled={sending}
                aria-describedby="test-recipient-help"
              />
              <p id="test-recipient-help" className="text-sm text-muted-foreground">
                Tests go to your verified admin email address. Use the Email workspace for
                production sends.
              </p>
            </div>
            {sampleFields(testVariables, 'test')}
            {!!missingSamples.length && (
              <p className="text-sm text-muted-foreground">
                Missing samples: {missingSamples.join(', ')}
              </p>
            )}
            {testError && (
              <p role="alert" className="text-sm text-destructive">
                {testError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTestDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={sending || !recipient.trim() || !!missingSamples.length}
              >
                {sending ? 'Sending…' : 'Send test'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your email has unsaved changes. Keep editing to preserve your draft, or discard it and
              continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearRecovery();
                setDraft(null);
                setExportPending(false);
                const action = pendingAction;
                setPendingAction(null);
                action?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!recovery}
        onOpenChange={(open) => {
          if (!open) setRecovery(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore your email draft?</AlertDialogTitle>
            <AlertDialogDescription>
              An unsaved draft is available from this browser session. Restore it to continue
              editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                clearRecovery();
                if (selected) {
                  setDraft({ ...selected });
                  setBlockMode(!!readBlockDocument(selected.html_content));
                }
              }}
            >
              Start from saved
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recovery) {
                  setDraft(recovery);
                  setBlockMode(!!readBlockDocument(recovery.html_content));
                }
                setRecovery(null);
              }}
            >
              Restore draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
