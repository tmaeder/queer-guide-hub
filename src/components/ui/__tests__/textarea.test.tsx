import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Textarea } from '../textarea';

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  setter?.call(el, value);
}

describe('Textarea', () => {
  it('swallows redundant onChange for identical value', () => {
    const onChange = vi.fn();
    const { container } = render(<Textarea value="hello" onChange={onChange} />);
    const el = container.querySelector('textarea') as HTMLTextAreaElement;

    setNativeValue(el, 'hello');
    fireEvent.input(el, { bubbles: true });
    fireEvent.change(el, { bubbles: true });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onChange once per distinct value', () => {
    const onChange = vi.fn();
    const { container } = render(<Textarea value="" onChange={onChange} />);
    const el = container.querySelector('textarea') as HTMLTextAreaElement;

    setNativeValue(el, 'a');
    fireEvent.input(el, { bubbles: true });
    setNativeValue(el, 'ab');
    fireEvent.input(el, { bubbles: true });

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not loop under repeated programmatic dispatch', () => {
    let renders = 0;
    const Host = () => {
      const [v, setV] = useState('init');
      renders++;
      return <Textarea value={v} onChange={(e) => setV(e.target.value)} />;
    };
    const { container } = render(<Host />);
    const el = container.querySelector('textarea') as HTMLTextAreaElement;

    for (let i = 0; i < 10; i++) {
      setNativeValue(el, 'init');
      fireEvent.input(el, { bubbles: true });
      fireEvent.change(el, { bubbles: true });
    }
    expect(renders).toBeLessThan(5);
  });
});
