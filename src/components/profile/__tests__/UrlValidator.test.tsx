import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UrlValidator } from '../UrlValidator';

describe('UrlValidator', () => {
  it('should return null for empty URL', () => {
    const { container } = render(<UrlValidator url="" />);
    expect(container.innerHTML).toBe('');
  });

  it('should render validate button for non-empty URL', () => {
    render(<UrlValidator url="https://example.com" />);
    expect(screen.getByText('Validate')).toBeInTheDocument();
  });

  it('should show Valid for valid https URL', async () => {
    render(<UrlValidator url="https://example.com" />);
    fireEvent.click(screen.getByText('Validate'));
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());
  });

  it('should show Invalid for non-URL string', async () => {
    render(<UrlValidator url="not a url at all" />);
    fireEvent.click(screen.getByText('Validate'));
    await waitFor(() => expect(screen.getByText('Invalid')).toBeInTheDocument());
  });

  it('should auto-prepend https for URLs without protocol', async () => {
    const onValidate = vi.fn();
    render(<UrlValidator url="example.com" onValidate={onValidate} />);
    fireEvent.click(screen.getByText('Validate'));
    await waitFor(() => expect(onValidate).toHaveBeenCalledWith('https://example.com', true));
  });

  it('should reject javascript: protocol', async () => {
    render(<UrlValidator url="javascript:alert(1)" />);
    fireEvent.click(screen.getByText('Validate'));
    await waitFor(() => expect(screen.getByText('Invalid')).toBeInTheDocument());
  });

  it('should call onValidate callback', async () => {
    const onValidate = vi.fn();
    render(<UrlValidator url="https://test.com" onValidate={onValidate} />);
    fireEvent.click(screen.getByText('Validate'));
    await waitFor(() => expect(onValidate).toHaveBeenCalledWith('https://test.com', true));
  });
});
