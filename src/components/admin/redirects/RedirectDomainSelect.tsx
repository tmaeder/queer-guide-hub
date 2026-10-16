import { useId } from 'react';
import type { RedirectDomainSelection } from '@/hooks/useRedirectDomainChoices';
import { selectedDomainUrl } from '@/lib/redirects/domainChoices';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
export function RedirectDomainSelect({
  selection,
  slug,
  isDomainRoot = false,
  disabled = false,
}: {
  selection: RedirectDomainSelection;
  slug?: string;
  isDomainRoot?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const { query, selected, existing } = selection;
  const currentUnavailable =
    !!existing?.id && !query.data?.data.some((domain) => domain.id === existing.id);
  const unavailableSelection =
    !!selected &&
    selected !== 'unavailable' &&
    !selection.preserving &&
    !!query.data &&
    !query.data.data.some((domain) => domain.id === selected);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Short-link domain</Label>
      <select
        id={id}
        className="w-full rounded-element border bg-background p-2 text-sm"
        value={selected}
        disabled={disabled || query.isPending}
        onChange={(event) => selection.setSelected(event.target.value)}
      >
        {unavailableSelection && (
          <option value={selected} disabled>
            Selected domain unavailable — choose a domain
          </option>
        )}
        {selected === 'unavailable' && (
          <option value="unavailable" disabled>
            Primary domain unavailable — choose a domain
          </option>
        )}
        <option value="">queer.guide/go</option>
        {currentUnavailable && (
          <option value={existing.id!}>{existing.hostname ?? 'Current domain'} (current)</option>
        )}
        {query.data?.data.map((domain) => (
          <option key={domain.id} value={domain.id}>
            {domain.hostname}
            {domain.id === query.data.primaryDomainId ? ' (primary)' : ''}
          </option>
        ))}
      </select>
      {query.isPending && (
        <p role="status" className="text-sm">
          Loading domains…
        </p>
      )}
      {query.isError && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            Could not load available domains.{' '}
            {selection.preserving
              ? 'The existing domain can be preserved.'
              : 'Refresh before creating a link.'}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Retry domains
          </Button>
        </div>
      )}
      {unavailableSelection && (
        <p role="alert" className="text-sm">
          The selected domain is unavailable. Choose another domain to continue.
        </p>
      )}
      {query.data?.primaryUnavailable && selected === 'unavailable' && (
        <p role="alert" className="text-sm">
          The primary domain is unavailable. Choose another domain to continue.
        </p>
      )}
      {slug !== undefined && selection.valid && (!isDomainRoot || !!selection.hostname) && (
        <p className="break-all text-xs text-muted-foreground">
          {selectedDomainUrl(selection.hostname, isDomainRoot ? '' : slug)}
        </p>
      )}
    </div>
  );
}
