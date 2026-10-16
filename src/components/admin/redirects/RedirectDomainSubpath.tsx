import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { subpathSetup, type SubpathPlatform, type SubpathSetup } from '@/lib/redirects/subpath';

export function RedirectDomainSubpath({ hostname, ready }: { hostname: string; ready: boolean }) {
  return <SubpathForm key={hostname + ':' + ready} hostname={hostname} ready={ready} />;
}
function SubpathForm({ hostname, ready }: { hostname: string; ready: boolean }) {
  const [website, setWebsite] = useState('');
  const [prefix, setPrefix] = useState('/r');
  const [platform, setPlatform] = useState<SubpathPlatform>('cloudflare');
  const [setup, setSetup] = useState<SubpathSetup | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState(false);
  const reset = () => {
    setSetup(null);
    setMessage('');
    setError('');
  };
  const id = 'redirect-subpath-' + hostname;
  return (
    <details className="min-w-0 space-y-4">
      <summary className="cursor-pointer font-medium">Use under a website path</summary>
      <p className="text-sm text-muted-foreground">
        Keep your website at its current address and forward a chosen path to {hostname}. Visitors
        move to the short-link hostname, where existing link settings and tracking apply. Install
        the generated configuration on your website to activate this entry path.
      </p>
      {!ready && (
        <p className="text-sm">
          Verify ownership, TLS and branded routing before generating website configuration.
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          reset();
          if (!ready) {
            setError('Branded routing must be ready before setup.');
            return;
          }
          try {
            setSetup(subpathSetup(website, prefix, hostname, platform));
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Check the website and path.');
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={id + '-website'}>Existing website origin</Label>
            <Input
              id={id + '-website'}
              type="url"
              placeholder="https://example.com"
              value={website}
              maxLength={260}
              required
              disabled={copying}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setWebsite(event.target.value);
                reset();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + '-prefix'}>Website path prefix</Label>
            <Input
              id={id + '-prefix'}
              placeholder="/r"
              value={prefix}
              maxLength={120}
              required
              disabled={copying}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setPrefix(event.target.value);
                reset();
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id + '-platform'}>Website hosting</Label>
          <select
            id={id + '-platform'}
            className="min-h-11 w-full rounded-element border bg-background p-2 text-sm"
            value={platform}
            disabled={copying}
            onChange={(event) => {
              setPlatform(event.target.value as SubpathPlatform);
              reset();
            }}
          >
            <option value="cloudflare">Cloudflare Worker Route</option>
            <option value="nextjs">Next.js</option>
            <option value="vercel">Vercel</option>
            <option value="netlify">Netlify</option>
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={!ready || copying || !website || !prefix}>
          Generate website configuration
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {setup && (
        <div className="min-w-0 space-y-4">
          <dl className="space-y-2 text-sm">
            <dt>Example visitor entry</dt>
            <dd className="break-all">{setup.entryExample}</dd>
            <dt>Continues at</dt>
            <dd className="break-all">{setup.targetExample}</dd>
          </dl>
          <p className="text-sm">{setup.instructions}</p>
          <div className="space-y-2">
            <Label htmlFor={id + '-configuration'}>{setup.filename} configuration</Label>
            <Textarea
              id={id + '-configuration'}
              className="min-h-64 font-mono text-sm"
              readOnly
              spellCheck={false}
              value={setup.configuration}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={copying}
            onClick={async () => {
              setCopying(true);
              setMessage('');
              try {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await navigator.clipboard.writeText(setup.configuration);
                setMessage('Website configuration copied. Install and test it on your website.');
              } catch {
                setMessage('Select and copy the configuration above.');
              } finally {
                setCopying(false);
              }
            }}
          >
            {copying ? 'Copying configuration…' : 'Copy website configuration'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Temporary redirects preserve campaign query parameters. Saved short-link URLs keep using{' '}
            {hostname}. Generating this setup makes no website or DNS change.
          </p>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </details>
  );
}
