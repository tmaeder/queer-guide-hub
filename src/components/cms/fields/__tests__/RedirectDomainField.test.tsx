import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FieldRenderer } from '../FieldRenderer';
import { redirectContentType } from '@/config/contentTypes/redirect';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: mocks.api }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
const domain = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const field = redirectContentType.fields.find((field) => field.name === 'domain_id')!;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.mockResolvedValue({
    data: [
      { id: domain, hostname: 'links.community.com' },
      { id: other, hostname: 'other.community.com' },
    ],
    count: 2,
    nextCursor: null,
    primaryDomainId: domain,
    primaryUnavailable: false,
  });
});
function Form({
  initial = 'pending',
  original = {},
}: {
  initial?: string | null;
  original?: Record<string, unknown>;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <FieldRenderer
        field={field}
        value={value}
        onChange={(value) => setValue(value as string | null)}
        allValues={{ ...original, type: 'SHORT', slug: 'cms-link' }}
        originalValues={original}
      />
      <p data-testid="bound-value">{String(value)}</p>
    </>
  );
}
function show(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
describe('active CMS domain field', () => {
  it('shows the canonical root URL for an existing homepage with an internal storage slug', async () => {
    show(
      <Form
        initial={domain}
        original={{
          id: 'link',
          type: 'SHORT',
          domain_id: domain,
          domain_hostname: 'links.community.com',
          is_domain_root: true,
        }}
      />,
    );
    expect(await screen.findByText('https://links.community.com/')).toBeVisible();
    expect(screen.queryByText('https://links.community.com/cms-link')).not.toBeInTheDocument();
  });
  it('adopts the ready primary for a new record and persists an explicit builtin choice', async () => {
    show(<Form />);
    await waitFor(() => expect(screen.getByTestId('bound-value')).toHaveTextContent(domain));
    expect(screen.getByText('https://links.community.com/cms-link')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Short-link domain'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByTestId('bound-value')).toHaveTextContent('null'));
  });
  it('retains an existing unavailable binding for repair', async () => {
    mocks.api.mockResolvedValue({
      data: [],
      count: 0,
      nextCursor: null,
      primaryDomainId: null,
      primaryUnavailable: false,
    });
    show(
      <Form
        initial={domain}
        original={{
          id: 'existing',
          type: 'SHORT',
          domain_id: domain,
          domain_hostname: 'links.community.com',
        }}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText('Short-link domain')).toBeEnabled());
    expect(screen.getByTestId('bound-value')).toHaveTextContent(domain);
    expect(
      screen.getByRole('option', { name: 'links.community.com (current)' }),
    ).toBeInTheDocument();
  });
  it('does not overwrite a refreshed server binding with its original value', async () => {
    const onChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (id: string) => (
      <QueryClientProvider client={client}>
        <FieldRenderer
          field={field}
          value={id}
          onChange={onChange}
          allValues={{ id: 'row', type: 'SHORT', slug: 'cms-link' }}
          originalValues={{
            id: 'row',
            type: 'SHORT',
            domain_id: id,
            domain_hostname: id === domain ? 'links.community.com' : 'other.community.com',
          }}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view(domain));
    await waitFor(() => expect(screen.getByLabelText('Short-link domain')).toBeEnabled());
    rerender(view(other));
    expect(screen.getByLabelText('Short-link domain')).toHaveValue(other);
    expect(onChange).not.toHaveBeenCalled();
  });
});
