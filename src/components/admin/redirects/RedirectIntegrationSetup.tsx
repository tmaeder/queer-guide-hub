import { RedirectIntegrationInstallations } from './RedirectIntegrationInstallations';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RedirectWebhookCreate, type WebhookPreset } from './RedirectWebhooks';
export function RedirectIntegrationSetup() {
  const { user } = useAuth();
  return user ? <IntegrationSetupWorkspace key={user.id} userId={user.id} /> : null;
}
function IntegrationSetupWorkspace({ userId }: { userId: string }) {
  const [kind, setKind] = useState<'segment' | 'gtm'>('segment'),
    [endpoint, setEndpoint] = useState(''),
    [customerIds, setCustomerIds] = useState(false),
    [preset, setPreset] = useState<WebhookPreset | null>(null),
    [error, setError] = useState('');
  const configure = () => {
    try {
      const value = new URL(endpoint);
      if (
        value.protocol !== 'https:' ||
        value.username ||
        value.password ||
        value.hash ||
        value.href.length > 2048
      )
        throw new Error('Enter the HTTPS URL from your Segment Source Function.');
      setPreset({
        name: 'Segment customer events',
        url: value.href,
        eventTypes: ['link.clicked', 'lead.created', 'sale.created'],
        includeCustomerId: customerIds,
      });
      setError('');
    } catch {
      setError('Enter the HTTPS URL from your Segment Source Function.');
    }
  };
  return (
    <section aria-label="Conversion integrations" className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">Conversion integrations</h3>
      <RedirectIntegrationInstallations userId={userId} workspaceRole="owner" />
      <p className="text-sm text-muted-foreground">
        Install the provider adapter, configure a server credential, then verify a real test event
        in the provider’s debugger.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={kind === 'segment' ? 'default' : 'outline'}
          aria-pressed={kind === 'segment'}
          onClick={() => setKind('segment')}
        >
          Segment
        </Button>
        <Button
          variant={kind === 'gtm' ? 'default' : 'outline'}
          aria-pressed={kind === 'gtm'}
          onClick={() => setKind('gtm')}
        >
          Google Tag Manager
        </Button>
      </div>
      <p className="text-sm">Installation status: awaiting provider verification.</p>
      {kind === 'segment' ? (
        <div className="space-y-4">
          <h4 className="font-medium">Segment → Redirects</h4>
          <ol className="list-decimal space-y-2 pl-6 text-sm">
            <li>Download the destination adapter and create a Segment Destination Function.</li>
            <li>
              Add <code>apiKey</code> as a secret setting. Use a server key with conversions:write
              for the selected links.
            </li>
            <li>
              Optional settings <code>leadEvent</code> and <code>saleEvent</code> default to Sign Up
              and Order Completed.
            </li>
            <li>
              Send a trusted backend event with userId, messageId, and qg_click_id in properties or
              context.traits. Sales use amount_decimal in major currency units and uppercase
              currency.
            </li>
            <li>
              Run a test in Segment’s debugger and confirm the conversion in Redirects tracking.
            </li>
          </ol>
          <Button asChild variant="outline">
            <a href="/integrations/redirects/segment-destination.js" download>
              Download Segment destination
            </a>
          </Button>
          <h4 className="font-medium">Redirects → Segment</h4>
          <ol className="list-decimal space-y-2 pl-6 text-sm">
            <li>Download the source adapter and create a Segment Source Function.</li>
            <li>
              Use its HTTPS URL below to create a Redirects webhook. Save the one-time signing
              secret in the function’s secret setting <code>signingSecret</code>.
            </li>
            <li>
              After rotation, keep the old key in <code>previousSigningSecret</code> during the
              24-hour overlap.
            </li>
            <li>
              Send a test delivery and verify Redirect Integration Test in Segment’s source
              debugger.
            </li>
          </ol>
          <Button asChild variant="outline">
            <a href="/integrations/redirects/segment-source.js" download>
              Download Segment source
            </a>
          </Button>
          <div>
            <Label htmlFor="segment-source-url">Segment Source Function HTTPS URL</Label>
            <Input
              id="segment-source-url"
              type="url"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://your-source-function-url"
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={customerIds}
              onChange={(event) => setCustomerIds(event.target.checked)}
            />
            Send customer external IDs to Segment as userId. Otherwise events use anonymous IDs.
          </label>
          <Button onClick={configure}>Review outbound subscription</Button>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          {preset && (
            <RedirectWebhookCreate
              key={preset.url + ':' + preset.includeCustomerId}
              preset={preset}
              onClose={() => setPreset(null)}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="font-medium">Google server container → Redirects</h4>
          <ol className="list-decimal space-y-2 pl-6 text-sm">
            <li>
              Download the template and import it under Templates in your Google server container
              (image version 2.0 or newer).
            </li>
            <li>
              Add a tag using Redirects conversions. Keep the conversion API key in a server
              variable, with access to the selected links only.
            </li>
            <li>
              Map stable event/customer IDs, event name, consent, and the qg_click_id from an
              attributed visit. Map exact sale amounts as decimal strings in major units, plus
              uppercase currency.
            </li>
            <li>
              Trigger on events validated by your backend. Confirmed purchases should come from your
              payment backend, rather than a checkout-start browser event.
            </li>
            <li>
              Use Preview to check one success receipt, then confirm the event in Redirects. Reuse
              the event ID for a retry.
            </li>
          </ol>
          <Button asChild variant="outline">
            <a href="/integrations/redirects/google-server-conversions.tpl" download>
              Download Google server template
            </a>
          </Button>
          <div className="space-y-2">
            <h4 className="font-medium">Optional consented browser attribution</h4>
            <p className="text-sm">
              Install the browser helper through your web container. Call
              qgRedirects.setConsent(true) after analytics consent is granted, and setConsent(false)
              on revocation. The helper exposes the qg_click_id cookie and a qg_redirect_attribution
              dataLayer event.
            </p>
            <Button asChild variant="outline">
              <a href="/integrations/redirects/browser-attribution.js" download>
                Download browser attribution helper
              </a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Private API keys belong in the server container. Browser dataLayer events can trigger
            analytics tags after consent; they do not independently verify a payment.
          </p>
        </div>
      )}
    </section>
  );
}
