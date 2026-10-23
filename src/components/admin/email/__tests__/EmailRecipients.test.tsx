import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailRecipients } from '../EmailRecipients';
import { AudienceRuleEditor } from '../AudienceRuleEditor';
import { ruleError } from '../audienceRules';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const recipient = {
  kind: 'organization',
  id: '66666666-0000-4000-8000-000000000011',
  label: 'Fixture organisation',
  email: 'business@example.com',
  evidence: 'published_contact',
  subscriber_id: null,
  topics: null,
  eligibility: 'no_subscription',
};
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockResolvedValue({ data: { recipients: [recipient], next: null }, error: null });
});
describe('entity recipients', () => {
  it('queries the chosen canonical directory and imports only the entity reference', async () => {
    const imported = vi.fn();
    render(<EmailRecipients onImported={imported} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse recipients' }));
    await screen.findByText('business@example.com');
    fireEvent.click(
      screen.getByRole('button', { name: 'Add pending contact for Fixture organisation' }),
    );
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin', {
        body: { action: 'recipient-import', kind: 'organization', id: recipient.id },
      }),
    );
    await waitFor(() => expect(imported).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('No mail was sent');
    fireEvent.change(screen.getByLabelText('Recipient type'), { target: { value: 'vendor' } });
    expect(screen.queryByText('business@example.com')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Browse recipients' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin?resource=recipients&kind=vendor', {
        method: 'GET',
      }),
    );
  });
  it('does not offer import for suppressed mailboxes and preserves a failed next page', async () => {
    api.invoke.mockResolvedValueOnce({
      data: {
        recipients: [{ ...recipient, eligibility: 'recipient_suppressed' }],
        next: recipient.id,
      },
      error: null,
    });
    render(<EmailRecipients onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse recipients' }));
    await screen.findByText('business@example.com');
    expect(screen.queryByRole('button', { name: /Add pending contact/ })).not.toBeInTheDocument();
    api.invoke.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Next recipients' }));
    await screen.findByRole('alert');
    expect(screen.getByText('business@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous recipients' })).toBeDisabled();
  });
  it('offers typed recipient conditions and rejects unknown recipient kinds', () => {
    const change = vi.fn();
    render(
      <AudienceRuleEditor
        rule={{ field: 'recipient_kind', op: 'eq', value: 'organization' }}
        onChange={change}
      />,
    );
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'vendor' } });
    expect(change).toHaveBeenCalledWith({ field: 'recipient_kind', op: 'eq', value: 'vendor' });
    expect(
      ruleError({
        all: [
          { field: 'recipient_kind', op: 'in', value: ['organization', 'venue', 'vendor', 'user'] },
        ],
      }),
    ).toBeNull();
    expect(
      ruleError({ field: 'recipient_kind', op: 'eq', value: 'inferred_private_group' }),
    ).toBeTruthy();
  });
});
