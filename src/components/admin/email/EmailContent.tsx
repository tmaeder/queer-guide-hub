import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { reviewDocument, missingTokens } from './emailDocument';
interface Content {
  subject: string;
  html_content: string;
  text_content: string | null;
}
interface Translation extends Content {
  locale: string;
  version: number;
  is_active: boolean;
}
export function EmailContent({
  templates,
}: {
  templates: { template_key: string; name: string; is_active: boolean }[];
}) {
  const [key, setKey] = useState(''),
    [base, setBase] = useState<Content | null>(null),
    [locales, setLocales] = useState<{ locale: string; version: number; is_active: boolean }[]>([]),
    [locale, setLocale] = useState(''),
    [version, setVersion] = useState(0),
    [content, setContent] = useState<Content>({ subject: '', html_content: '', text_content: '' }),
    [active, setActive] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  const request = useRef(0);
  function adopt(value: Content, lang = '', rev = 0, enabled = true) {
    setContent(value);
    setLocale(lang);
    setVersion(rev);
    setActive(enabled);
    setDirty(false);
    setConflict(false);
  }
  async function load(templateKey: string, lang = '') {
    const sequence = ++request.current;
    setBusy(true);
    setNotice(null);
    try {
      const [baseResult, list, translation] = await Promise.all([
        supabase.functions.invoke('email-admin', {
          body: { action: 'content-preview', template_key: templateKey },
        }),
        supabase.functions.invoke(
          `email-admin?resource=localizations&key=${encodeURIComponent(templateKey)}`,
          { method: 'GET' },
        ),
        lang
          ? supabase.functions.invoke(
              `email-admin?resource=localizations&key=${encodeURIComponent(templateKey)}&locale=${encodeURIComponent(lang)}`,
              { method: 'GET' },
            )
          : Promise.resolve(null),
      ]);
      if (sequence !== request.current) return;
      if (
        baseResult.error ||
        !baseResult.data?.template ||
        list.error ||
        !Array.isArray(list.data?.localizations) ||
        translation?.error
      )
        throw new Error('content');
      const original = baseResult.data.template as Content;
      const selected = translation?.data?.localizations?.[0] as Translation | undefined;
      if (lang && !selected) throw new Error('missing translation');
      setKey(templateKey);
      setBase(original);
      setLocales(list.data.localizations);
      adopt(selected ?? original, selected?.locale, selected?.version, selected?.is_active);
    } catch {
      if (sequence === request.current)
        setNotice(
          'Content could not load. Your current edits are preserved. Retry the selected template.',
        );
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  }
  function change(field: keyof Content, value: string) {
    setDirty(true);
    setContent((c) => ({ ...c, [field]: value }));
    setNotice(null);
  }
  const missing = base
    ? missingTokens(
        base.subject + base.html_content + (base.text_content ?? ''),
        content.subject + content.html_content + (content.text_content ?? ''),
      )
    : [];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || conflict || missing.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: {
          action: 'localization-save',
          template_key: key,
          locale,
          subject: content.subject,
          html_content: content.html_content,
          text_content: content.text_content,
          expected_version: version,
          is_active: active,
        },
      });
      if (r.error) {
        if (r.error.context?.status === 409) {
          setConflict(true);
          setNotice(
            'This translation changed. Your edits are preserved. Reload the saved translation or keep the content for a different locale.',
          );
        } else
          setNotice(
            'Translation could not save. Check the base variables and content. Your edits are preserved.',
          );
        return;
      }
      if (!r.data?.localization) throw new Error('result');
      const saved = r.data.localization as Translation;
      adopt(saved, saved.locale, saved.version, saved.is_active);
      setLocales((prev) => [
        ...prev.filter((l) => l.locale !== saved.locale),
        { locale: saved.locale, version: saved.version, is_active: saved.is_active },
      ]);
      setNotice(
        `Translation saved as version ${saved.version}. Existing campaign versions keep their saved content.`,
      );
    } catch {
      setNotice(
        'The save result is unavailable. Your edits are preserved; reload before retrying if another operator may have saved.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-8 py-6" aria-label="Email content and languages">
      <header className="space-y-4">
        <h2 className="font-sans text-title font-bold">Content and languages</h2>
        <p className="text-sm text-muted-foreground">
          Resolution uses an active exact locale, then its language, then the active base template.
          A base variable change makes incompatible translations fall back safely. Campaigns pin the
          resolved content when saved; operational mail uses the recipient’s confirmed language
          choice when available.
        </p>
        <Link to="/admin/email?tab=templates" className="text-sm underline underline-offset-4">
          Edit base templates in Templates
        </Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email-content-template">Base template</Label>
          <select
            id="email-content-template"
            className="min-h-10 w-full border border-input bg-background px-4 text-sm"
            value={key}
            disabled={busy || dirty}
            onChange={(e) => {
              if (e.target.value) void load(e.target.value);
            }}
          >
            <option value="">Choose an active base template</option>
            {templates
              .filter((t) => t.is_active)
              .map((t) => (
                <option key={t.template_key} value={t.template_key}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
        {base && (
          <div>
            <Label htmlFor="email-content-saved">Saved translation</Label>
            <select
              id="email-content-saved"
              className="min-h-10 w-full border border-input bg-background px-4 text-sm"
              value={version ? locale : ''}
              disabled={busy || dirty}
              onChange={(e) => void load(key, e.target.value)}
            >
              <option value="">New locale from base content</option>
              {locales.map((l) => (
                <option key={l.locale} value={l.locale}>
                  {l.locale} · Version {l.version}
                  {l.is_active ? '' : ' · Inactive'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {notice && (
        <p role="status" className="border border-border p-4 text-sm">
          {notice}
        </p>
      )}
      {conflict && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void load(key, locale)}>
            Reload saved translation
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setVersion(0);
              setLocale('');
              setConflict(false);
              setDirty(true);
              setNotice(null);
            }}
          >
            Keep for a different locale
          </Button>
        </div>
      )}
      {base && (
        <form onSubmit={save} className="space-y-6">
          <fieldset disabled={busy} className="max-w-3xl space-y-4">
            <div>
              <Label htmlFor="email-content-locale">Locale code</Label>
              <Input
                id="email-content-locale"
                required
                pattern="[a-z]{2}(-[A-Za-z0-9]{2,8})?"
                maxLength={16}
                placeholder="de or de-CH"
                disabled={version > 0}
                value={locale}
                onChange={(e) => {
                  setLocale(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <div>
              <Label htmlFor="email-content-subject">Localized subject</Label>
              <Input
                id="email-content-subject"
                value={content.subject}
                required
                maxLength={998}
                onChange={(e) => change('subject', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email-content-html">Localized HTML</Label>
              <textarea
                id="email-content-html"
                className="min-h-64 w-full border border-input bg-background p-4 font-mono text-sm"
                required
                value={content.html_content}
                onChange={(e) => change('html_content', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="email-content-text">Localized plain text</Label>
              <textarea
                id="email-content-text"
                className="min-h-32 w-full border border-input bg-background p-4 text-sm"
                value={content.text_content ?? ''}
                onChange={(e) => change('text_content', e.target.value)}
              />
            </div>
            <div className="flex min-h-10 items-center gap-4">
              <input
                id="email-content-active"
                type="checkbox"
                checked={active}
                onChange={(e) => {
                  setActive(e.target.checked);
                  setDirty(true);
                }}
              />
              <Label htmlFor="email-content-active">
                Use this translation when its locale matches
              </Label>
            </div>
            {missing.length > 0 && (
              <p role="alert">Preserve these base variables: {missing.join(', ')}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  conflict ||
                  !locale ||
                  !content.subject.trim() ||
                  !content.html_content.trim() ||
                  !!missing.length
                }
              >
                {busy ? 'Saving…' : 'Save translation'}
              </Button>
              {dirty && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void load(key, version ? locale : '')}
                >
                  Discard translation edits
                </Button>
              )}
            </div>
          </fieldset>
          <section
            className="space-y-4 border-t border-border pt-6"
            aria-label="Localized content preview"
          >
            <h3 className="font-semibold">Local preview</h3>
            <p className="text-sm text-muted-foreground">
              Variables remain placeholders. This isolated preview cannot execute scripts, follow
              links or load remote images. No email is sent.
            </p>
            <iframe
              title="Localized email preview"
              sandbox=""
              className="h-96 w-full border border-border bg-white"
              srcDoc={reviewDocument(content.html_content)}
            />
          </section>
        </form>
      )}
    </section>
  );
}
