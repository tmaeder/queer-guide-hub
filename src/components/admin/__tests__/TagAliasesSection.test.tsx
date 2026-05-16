/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { useTagAliasesMock, createMutateAsync, deleteMutateAsync } = vi.hoisted(() => ({
  useTagAliasesMock: vi.fn(),
  createMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useTagAliases', () => ({ useTagAliases: useTagAliasesMock }));

import { TagAliasesSection } from '../TagAliasesSection';

beforeEach(() => {
  useTagAliasesMock.mockReset();
  createMutateAsync.mockReset();
  deleteMutateAsync.mockReset();
});

describe('TagAliasesSection', () => {
  it('shows loading state', () => {
    useTagAliasesMock.mockReturnValue({
      aliases: [], isLoading: true,
      createAlias: { mutateAsync: createMutateAsync, isPending: false },
      deleteAlias: { mutateAsync: deleteMutateAsync },
    });
    render(<TagAliasesSection tagId="t1" />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('shows empty hint when no aliases', () => {
    useTagAliasesMock.mockReturnValue({
      aliases: [], isLoading: false,
      createAlias: { mutateAsync: createMutateAsync, isPending: false },
      deleteAlias: { mutateAsync: deleteMutateAsync },
    });
    render(<TagAliasesSection tagId="t1" />);
    expect(screen.getByText(/No synonyms yet/)).toBeInTheDocument();
  });

  it('renders existing aliases', () => {
    useTagAliasesMock.mockReturnValue({
      aliases: [
        { id: 'a1', alias_name: 'gay', alias_type: 'synonym' },
        { id: 'a2', alias_name: 'lgbt', alias_type: 'abbreviation' },
      ],
      isLoading: false,
      createAlias: { mutateAsync: createMutateAsync, isPending: false },
      deleteAlias: { mutateAsync: deleteMutateAsync },
    });
    render(<TagAliasesSection tagId="t1" />);
    expect(screen.getByText('gay')).toBeInTheDocument();
    expect(screen.getByText('lgbt')).toBeInTheDocument();
  });

  it('Add fires createAlias.mutateAsync', async () => {
    createMutateAsync.mockResolvedValue(undefined);
    useTagAliasesMock.mockReturnValue({
      aliases: [], isLoading: false,
      createAlias: { mutateAsync: createMutateAsync, isPending: false },
      deleteAlias: { mutateAsync: deleteMutateAsync },
    });
    render(<TagAliasesSection tagId="t1" />);
    fireEvent.change(screen.getByPlaceholderText(/Add synonym/), { target: { value: 'queer' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledWith({ alias_name: 'queer', alias_type: 'synonym' }));
  });
});
