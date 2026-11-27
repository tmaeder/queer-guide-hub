import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate, useSearchParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useInboxSelection } from '../useInboxSelection';
import type { InboxItem } from '@/hooks/useInboxFeed';
const items = [
  { id: 'conv_a', kind: 'chat', title: 'Alex' },
  { id: 'conv_b', kind: 'chat', title: 'Blair' },
  { id: 'notification_n', kind: 'notification', title: 'Update' },
] as InboxItem[];
function Probe() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { selected, handleSelect, handleBack } = useInboxSelection('all', items, params, setParams);
  return (
    <>
      <output>{selected?.title ?? 'Inbox'}</output>
      <button onClick={() => handleSelect(items[1])}>Select Blair</button>
      <button onClick={() => handleSelect(items[2])}>Select update</button>
      <button onClick={() => navigate(-1)}>Browser back</button>
      <button onClick={() => setParams({ conversation: 'b' })}>Recipient picked</button>
      <button onClick={handleBack}>Back to inbox</button>
    </>
  );
}
function setup(entry = '/?conversation=a') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe />
    </MemoryRouter>,
  );
}
describe('inbox selection', () => {
  it('follows deep links, recipient-picker changes and browser back', () => {
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Alex');
    fireEvent.click(screen.getByText('Recipient picked'));
    expect(screen.getByRole('status')).toHaveTextContent('Blair');
    fireEvent.click(screen.getByText('Browser back'));
    expect(screen.getByRole('status')).toHaveTextContent('Alex');
    fireEvent.click(screen.getByText('Back to inbox'));
    expect(screen.getByRole('status')).toHaveTextContent('Inbox');
  });
  it('gives updates restorable selection state', () => {
    setup('/');
    fireEvent.click(screen.getByText('Select update'));
    expect(screen.getByRole('status')).toHaveTextContent('Update');
    fireEvent.click(screen.getByText('Back to inbox'));
    expect(screen.getByRole('status')).toHaveTextContent('Inbox');
  });
});
