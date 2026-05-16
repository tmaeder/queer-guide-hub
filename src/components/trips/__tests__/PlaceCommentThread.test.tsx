/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const {
  useAuthMock,
  usePostMock,
  useDeleteMock,
  postMutateAsync,
  delMutate,
  setNameSpy,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePostMock: vi.fn(),
  useDeleteMock: vi.fn(),
  postMutateAsync: vi.fn(),
  delMutate: vi.fn(),
  setNameSpy: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useTripComments', () => ({
  usePostTripComment: usePostMock,
  useDeleteTripComment: useDeleteMock,
  getViewerDisplayName: () => null,
  setViewerDisplayName: setNameSpy,
}));
vi.mock('@/hooks/useTripReactions', () => ({ getViewerFingerprint: () => 'fp1' }));

import { PlaceCommentThread } from '../PlaceCommentThread';

beforeEach(() => {
  useAuthMock.mockReset();
  usePostMock.mockReset();
  useDeleteMock.mockReset();
  postMutateAsync.mockReset();
  delMutate.mockReset();
  setNameSpy.mockReset();
  useAuthMock.mockReturnValue({ user: null });
  usePostMock.mockReturnValue({ mutateAsync: postMutateAsync, isPending: false, isError: false });
  useDeleteMock.mockReturnValue({ mutate: delMutate, isPending: false });
  postMutateAsync.mockResolvedValue(undefined);
});

const open = () => fireEvent.click(screen.getByRole('button', { name: /Comment|comments/i }));

describe('PlaceCommentThread', () => {
  it('shows Comment when no comments', () => {
    render(<PlaceCommentThread tripId="t1" placeId="p1" comments={[]} />);
    expect(screen.getByRole('button', { name: /Comment$/ })).toBeInTheDocument();
  });

  it('shows N comments label with singular/plural', () => {
    render(<PlaceCommentThread tripId="t1" placeId="p1" comments={[{ id: 'c1' } as never]} />);
    expect(screen.getByRole('button', { name: /1 comment$/ })).toBeInTheDocument();
  });

  it('opens thread, shows name input for anonymous user', () => {
    render(<PlaceCommentThread tripId="t1" placeId="p1" comments={[]} />);
    open();
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Add a comment/)).toBeInTheDocument();
  });

  it('hides name input for authed user', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<PlaceCommentThread tripId="t1" placeId="p1" comments={[]} />);
    open();
    expect(screen.queryByPlaceholderText('Your name')).toBeNull();
  });

  it('Post button disabled until body + name typed', () => {
    render(<PlaceCommentThread tripId="t1" placeId="p1" comments={[]} />);
    open();
    const post = screen.getByRole('button', { name: /Post comment/i });
    expect(post).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Add a comment/), { target: { value: 'Nice!' } });
    expect(post).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Me' } });
    expect(post).not.toBeDisabled();
  });

  it('submits comment with name + body and persists display name', async () => {
    render(<PlaceCommentThread tripId="t1" placeId="p1" comments={[]} />);
    open();
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText(/Add a comment/), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /Post comment/i }));
    await Promise.resolve();
    expect(postMutateAsync).toHaveBeenCalledWith({
      tripId: 't1', placeId: 'p1', body: 'Hello', displayName: 'Bob',
    });
  });

  it('renders existing comments with delete button when canDelete', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(
      <PlaceCommentThread
        tripId="t1"
        placeId="p1"
        comments={[{ id: 'c1', display_name: 'Bob', body: 'hi', created_at: new Date().toISOString(), viewer_id: 'u1' } as never]}
      />,
    );
    open();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /delete comment/i }));
    expect(delMutate).toHaveBeenCalledWith({ id: 'c1', tripId: 't1' });
  });

  it('shows error message when post fails', () => {
    usePostMock.mockReturnValue({ mutateAsync: postMutateAsync, isPending: false, isError: true });
    render(<PlaceCommentThread tripId="t1" placeId="p1" comments={[]} />);
    open();
    expect(screen.getByText(/Could not post comment/i)).toBeInTheDocument();
  });
});
