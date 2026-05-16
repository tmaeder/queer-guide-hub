/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OnboardingTour from '../OnboardingTour';

beforeEach(() => {
  localStorage.clear();
});

describe('OnboardingTour', () => {
  it('opens automatically on first visit', () => {
    render(<OnboardingTour />);
    expect(screen.getByRole('heading', { name: /Welcome to the Pipeline Builder/ })).toBeInTheDocument();
  });

  it('does not open if STORAGE_KEY set', () => {
    localStorage.setItem('pipeline-builder-tour-seen-v1', '1');
    render(<OnboardingTour />);
    expect(screen.queryByRole('heading', { name: /Welcome/ })).toBeNull();
  });

  it('forceOpen always opens', () => {
    localStorage.setItem('pipeline-builder-tour-seen-v1', '1');
    render(<OnboardingTour forceOpen />);
    expect(screen.getByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('Next advances step', () => {
    render(<OnboardingTour />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('heading', { name: /Keyboard-first workflow/ })).toBeInTheDocument();
  });

  it('Skip marks seen + calls onClose', () => {
    const onClose = vi.fn();
    render(<OnboardingTour onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip tour/ }));
    expect(localStorage.getItem('pipeline-builder-tour-seen-v1')).toBe('1');
    expect(onClose).toHaveBeenCalled();
  });
});
