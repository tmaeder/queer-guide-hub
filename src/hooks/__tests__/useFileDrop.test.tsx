/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFileDrop, matchesAccept } from '../useFileDrop';

function Zone(props: Parameters<typeof useFileDrop>[0]) {
  const { getRootProps, getInputProps, isDragActive } = useFileDrop(props);
  return (
    <div {...getRootProps()} data-testid="zone">
      <input {...getInputProps()} data-testid="input" />
      {isDragActive ? 'active' : 'idle'}
    </div>
  );
}

const png = new File(['x'], 'a.png', { type: 'image/png' });
const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
const big = new File(['xxxxxxxxxx'], 'big.png', { type: 'image/png' });

describe('useFileDrop', () => {
  it('matches mime, wildcard and extension rules', () => {
    expect(matchesAccept(png, ['image/*'])).toBe(true);
    expect(matchesAccept(pdf, ['image/png'])).toBe(false);
    expect(matchesAccept(pdf, ['.pdf'])).toBe(true);
    expect(matchesAccept(pdf, undefined)).toBe(true);
  });

  it('splits dropped files into accepted and rejected', () => {
    const onDrop = vi.fn();
    const onDropRejected = vi.fn();
    render(
      <Zone onDrop={onDrop} onDropRejected={onDropRejected} accept={['image/png']} maxSize={5} />,
    );
    fireEvent.drop(screen.getByTestId('zone'), { dataTransfer: { files: [png, pdf, big] } });
    expect(onDrop).toHaveBeenCalledWith([png]);
    expect(onDropRejected.mock.calls[0][0].map((r: { file: File }) => r.file)).toEqual([pdf, big]);
  });

  it('keeps only the first file when multiple is false', () => {
    const onDrop = vi.fn();
    render(<Zone onDrop={onDrop} multiple={false} />);
    fireEvent.change(screen.getByTestId('input'), { target: { files: [png, pdf] } });
    expect(onDrop).toHaveBeenCalledWith([png]);
  });

  it('shows drag state and ignores drops when disabled', () => {
    const onDrop = vi.fn();
    const { rerender } = render(<Zone onDrop={onDrop} />);
    fireEvent.dragOver(screen.getByTestId('zone'));
    expect(screen.getByTestId('zone').textContent).toBe('active');
    rerender(<Zone onDrop={onDrop} disabled />);
    fireEvent.drop(screen.getByTestId('zone'), { dataTransfer: { files: [png] } });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('opens the picker from the keyboard', () => {
    render(<Zone onDrop={vi.fn()} />);
    const click = vi.spyOn(screen.getByTestId('input'), 'click');
    fireEvent.keyDown(screen.getByTestId('zone'), { key: 'Enter' });
    expect(click).toHaveBeenCalled();
  });
});
