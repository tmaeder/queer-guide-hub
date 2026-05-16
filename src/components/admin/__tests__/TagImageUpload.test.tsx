/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({}) } } }));
vi.mock('@/lib/uploadErrors', () => ({ MAX_UPLOAD_BYTES: 20 * 1024 * 1024, MAX_UPLOAD_MB: 20 }));

import { TagImageUpload } from '../TagImageUpload';

describe('TagImageUpload', () => {
  it('renders upload prompt when no image', () => {
    render(<TagImageUpload onImageChange={vi.fn()} />);
    expect(screen.getByText(/Upload an image for this tag/i)).toBeInTheDocument();
    expect(screen.getByText(/PNG, JPG, WebP/i)).toBeInTheDocument();
  });

  it('renders preview when image url provided', () => {
    render(<TagImageUpload currentImageUrl="https://x/foo.jpg" onImageChange={vi.fn()} tagName="Test" />);
    expect(screen.getByRole('img', { name: 'Test' })).toHaveAttribute('src', 'https://x/foo.jpg');
  });

  it('delete button fires onImageChange(null)', () => {
    const onChange = vi.fn();
    render(<TagImageUpload currentImageUrl="https://x/foo.jpg" onImageChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
