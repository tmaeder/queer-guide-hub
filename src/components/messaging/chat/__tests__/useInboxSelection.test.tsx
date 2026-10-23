import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { expect, it } from 'vitest';
import type { PropsWithChildren } from 'react';
import { useInboxSelection } from '../useInboxSelection';
import { mailboxSelection } from '@/lib/mailboxSelection';
import type { InboxItem } from '@/hooks/useInboxFeed';
const first = '88888888-0000-4000-8000-000000000030',
  second = '88888888-0000-4000-8000-000000000031';
function wrapper({ children }: PropsWithChildren) {
  return (
    <MemoryRouter initialEntries={[`/messages?email=${first}&keep=1`]}>{children}</MemoryRouter>
  );
}
function useSelection() {
  const [params, setParams] = useSearchParams();
  return { ...useInboxSelection('mail', [] as InboxItem[], params, setParams), params, setParams };
}
it('opens a valid sent-mail reference outside the loaded rail without invented metadata', async () => {
  const { result } = renderHook(useSelection, { wrapper });
  await waitFor(() => expect(result.current.selected?.id).toBe(`mail_${first}`));
  expect(result.current.selected).toMatchObject({ kind: 'mail', title: '', preview: '', ts: '' });
});
it('follows a new canonical reply ID even when the previous mail remains selected', async () => {
  const { result } = renderHook(useSelection, { wrapper });
  await waitFor(() => expect(result.current.selected?.id).toBe(`mail_${first}`));
  act(() =>
    result.current.setParams(new URLSearchParams(`email=${second}&keep=1`), { replace: true }),
  );
  await waitFor(() => expect(result.current.selected?.id).toBe(`mail_${second}`));
  expect(result.current.params.get('keep')).toBe('1');
});
it('selects a saved copy immediately after send and can return to the rail', async () => {
  const { result } = renderHook(useSelection, { wrapper });
  await waitFor(() => expect(result.current.selected?.id).toBe(`mail_${first}`));
  act(() => result.current.handleSelect(mailboxSelection(second)!));
  await waitFor(() => expect(result.current.selected?.id).toBe(`mail_${second}`));
  expect(result.current.params.get('email')).toBe(second);
  act(() => result.current.handleBack());
  await waitFor(() => expect(result.current.selected).toBeNull());
  expect(result.current.params.has('email')).toBe(false);
});
it('rejects malformed references without creating a readable selection', async () => {
  const { result } = renderHook(useSelection, { wrapper });
  await waitFor(() => expect(result.current.selected?.id).toBe(`mail_${first}`));
  act(() => result.current.setParams(new URLSearchParams('email=../admin')));
  await waitFor(() => expect(result.current.selected).toBeNull());
  expect(mailboxSelection('not-a-message')).toBeNull();
});
