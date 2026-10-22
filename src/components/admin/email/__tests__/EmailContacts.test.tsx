import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailContacts } from '../EmailContacts';
import { parseContactImport } from '../contactImport';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const contact = {
  id: '55555555-0000-4000-8000-000000000001',
  email: 'member@example.com',
  status: 'subscribed',
  topics: ['newsletter'],
  locale: 'en',
  source: 'website',
  confirmed_at: '2026-10-21T00:00:00Z',
};
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockResolvedValue({
    data: { contacts: [contact], next: '55555555-0000-4000-8000-000000000002' },
    error: null,
  });
});
describe('contact operations', () => {
  it('keeps long mailbox history actions compact while retaining their accessible identity', async () => {
    const email = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.example.com';
    api.invoke.mockResolvedValue({
      data: { contacts: [{ ...contact, email }], next: null },
      error: null,
    });
    render(<EmailContacts />);
    const action = await screen.findByRole('button', { name: `History for ${email}` });
    expect(action).toHaveTextContent(/^View history$/);
  });
  it('validates CSV quoting and rejects imported consent, invalid addresses and oversized batches', () => {
    expect(parseContactImport('\uFEFFemail,locale\r\n"PERSON@example.com",de-CH\r\n')).toEqual([
      { email: 'person@example.com', locale: 'de-CH' },
    ]);
    for (const csv of [
      'email,status\na@example.com,subscribed',
      'email\nnot-an-email',
      'email\n"unclosed',
      'email\n' + Array.from({ length: 101 }, (_, i) => `a${i}@example.com`).join('\n'),
    ])
      expect(() => parseContactImport(csv)).toThrow();
  });
  it('preserves page position after a failed next-page request', async () => {
    render(<EmailContacts />);
    await screen.findByText('member@example.com');
    api.invoke.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Next contacts' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Previous contacts' })).toBeDisabled();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();
  });
  it('discards a contact history response that belongs to a prior page', async () => {
    let resolve!: (value: unknown) => void;
    api.invoke.mockImplementation(async (url) =>
      url.includes('resource=timeline')
        ? new Promise((r) => {
            resolve = r;
          })
        : {
            data: { contacts: [contact], next: '55555555-0000-4000-8000-000000000002' },
            error: null,
          },
    );
    render(<EmailContacts />);
    await screen.findByText('member@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'History for member@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next contacts' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith(expect.stringContaining('&after='), {
        method: 'GET',
      }),
    );
    resolve({ data: { events: [{ id: 'stale', kind: 'stale-contact-event' }] }, error: null });
    await waitFor(() => expect(screen.queryByText('stale-contact-event')).not.toBeInTheDocument());
  });
});
