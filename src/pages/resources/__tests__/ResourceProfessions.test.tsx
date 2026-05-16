/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResourceProfessions } from '../ResourceProfessions';

describe('ResourceProfessions', () => {
  it('renders count and one button per profession', () => {
    render(<ResourceProfessions professions={['actor', 'activist']} onBack={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'actor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'activist' })).toBeInTheDocument();
  });

  it('Back button fires onBack', () => {
    const onBack = vi.fn();
    render(<ResourceProfessions professions={[]} onBack={onBack} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('profession chip navigates with encoded query', () => {
    const onNav = vi.fn();
    render(<ResourceProfessions professions={['drag queen']} onBack={vi.fn()} onNavigate={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'drag queen' }));
    expect(onNav).toHaveBeenCalledWith('/personalities?profession=drag%20queen');
  });
});
