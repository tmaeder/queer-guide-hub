import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../CookiePreferencesDialog', () => ({ CookiePreferencesDialog: ({ open }: any) => open ? <div data-testid="dialog">Dialog</div> : null }));
import { CookieSettingsButton } from '../CookieSettingsButton';
describe('CookieSettingsButton', () => {
  it('should render button with Cookie Settings text', () => { render(<CookieSettingsButton />); expect(screen.getByText('Cookie Settings')).toBeInTheDocument(); });
  it('should open dialog on click', () => { render(<CookieSettingsButton />); fireEvent.click(screen.getByText('Cookie Settings')); expect(screen.getByTestId('dialog')).toBeInTheDocument(); });
});
