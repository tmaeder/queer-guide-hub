import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectMemberTags } from './RedirectMemberTags';

const mocks = vi.hoisted(() => ({ api: vi.fn(), changed: vi.fn(), close: vi.fn() }));
vi.mock('@/lib/redirects/memberApi', () => ({ memberRedirectApi: mocks.api }));
const tags = [{ id: 'tag-one', name: 'Pride', color: 'purple' }];
function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <RedirectMemberTags tags={tags} onChanged={mocks.changed} onClose={mocks.close} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({ id: 'saved-tag' });
  mocks.changed.mockResolvedValue(undefined);
});
describe('member tag management', () => {
  it('creates a shared colored tag and refreshes workspace resources', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: ' Summer ' } });
    fireEvent.change(screen.getByLabelText('Tag color'), { target: { value: 'blue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create tag' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/tags', 'POST', { name: 'Summer', color: 'blue' }),
    );
    await waitFor(() => expect(mocks.changed).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Tag name')).toHaveValue('');
  });
  it('edits the selected tag without creating a second resource', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit tag Pride' }));
    expect(screen.getByLabelText('Tag color')).toHaveValue('purple');
    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Pride 2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tag' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/tags/tag-one', 'PATCH', {
        name: 'Pride 2027',
        color: 'purple',
      }),
    );
  });
  it('requires confirmation before removing a tag from all links', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Delete tag Pride' }));
    expect(mocks.api).not.toHaveBeenCalled();
    expect(screen.getByText(/remove it from every link/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete tag' }));
    await waitFor(() =>
      expect(mocks.api).toHaveBeenCalledWith('/tags/tag-one', 'DELETE', undefined),
    );
  });
  it('keeps a rejected edit visible without reporting success', async () => {
    mocks.api.mockRejectedValue(new Error('Workspace access changed'));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit tag Pride' }));
    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'Kept draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tag' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Workspace access changed');
    expect(screen.getByLabelText('Tag name')).toHaveValue('Kept draft');
    expect(mocks.changed).not.toHaveBeenCalled();
  });
});
