import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

// The forms have their own specs; here only that they open in place.
vi.mock('@/components/contribute/FeedbackForm', () => ({
  default: () => <div data-testid="feedback-form" />,
}));
vi.mock('@/components/contribute/CorrectionForm', () => ({
  default: () => <div data-testid="correction-form" />,
}));

import { ContributePanel } from '../ContributePanel';
import { submissionTypes } from '@/config/submissionRegistry';

const renderPanel = () =>
  render(
    <MemoryRouter>
      <ContributePanel onNavigate={() => {}} />
    </MemoryRouter>,
  );

describe('Hub menu Contribute tab', () => {
  it('offers the four ways in; contacting the team opens /contact', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /report a problem or idea/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fix something on this page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add something new/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contact the team/i })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  it('opens the report form in place, and Back returns', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /report a problem or idea/i }));
    expect(await screen.findByTestId('feedback-form')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: /fix something on this page/i })).toBeInTheDocument();
  });

  it('lists every submission type, each linked to its submission page', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /add something new/i }));
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(submissionTypes.map((type) => `/submit/${type.id}`));
  });
});
