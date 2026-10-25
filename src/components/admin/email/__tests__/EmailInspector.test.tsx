import { describe, expect, it } from 'vitest';
import { labelEmailInspector } from '../emailInspectorAccessibility';

describe('email property accessibility adapter', () => {
  it('distinguishes color controls and exposes section disclosure state', () => {
    const root = document.createElement('aside');
    root.innerHTML = `<div data-re-inspector-section>
      <button data-re-inspector-section-toggle>Background</button>
      <div data-re-inspector-section-body><div data-re-inspector-prop-row>
        <label data-re-inspector-label>Color</label>
        <input type="color" data-re-inspector-color-trigger>
        <input data-re-inspector-color-hex>
      </div></div></div>`;
    labelEmailInspector(root);
    expect(root.querySelector('input[type="color"]')).toHaveAccessibleName(
      'Background Color color picker',
    );
    expect(root.querySelector('[data-re-inspector-color-hex]')).toHaveAccessibleName(
      'Background Color hex value',
    );
    expect(root.querySelector('button')).toHaveAttribute('aria-expanded', 'true');
    root.querySelector('[data-re-inspector-section-body]')?.remove();
    labelEmailInspector(root);
    expect(root.querySelector('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('names icon-only mode buttons and individual spacing fields', () => {
    const root = document.createElement('aside');
    root.innerHTML = `<div data-re-inspector-section>
      <button data-re-inspector-section-toggle>Spacing</button>
      <div data-re-inspector-section-body><div><div data-re-inspector-prop-row>
        <label data-re-inspector-label>Padding</label><div role="group">
        <span data-re-inspector-tooltip><button></button>
        <span data-re-inspector-tooltip-content>Per side</span></span></div>
      </div><div><input><input><input><input></div></div></div></div>`;
    labelEmailInspector(root);
    expect(root.querySelector('[role="group"]')).toHaveAccessibleName('Spacing Padding');
    expect(root.querySelector('[data-re-inspector-tooltip] button')).toHaveAccessibleName(
      'Spacing Padding Per side',
    );
    expect(
      Array.from(root.querySelectorAll('input'), (el) => el.getAttribute('aria-label')),
    ).toEqual([
      'Spacing Padding top',
      'Spacing Padding right',
      'Spacing Padding bottom',
      'Spacing Padding left',
    ]);
  });

  it('refreshes generated names on selection changes and preserves explicit labels', () => {
    const root = document.createElement('aside');
    root.innerHTML = `<div data-re-inspector-section>
      <button data-re-inspector-section-toggle>Container</button>
      <div data-re-inspector-section-body><div data-re-inspector-prop-row>
        <label data-re-inspector-label>Width</label><input>
      </div><input aria-label="Custom label"><label>Native label<input></label></div></div>`;
    labelEmailInspector(root);
    expect(root.querySelector('input')).toHaveAccessibleName('Container Width');
    root.querySelector('[data-re-inspector-label]')!.textContent = 'Height';
    labelEmailInspector(root);
    expect(root.querySelector('input')).toHaveAccessibleName('Container Height');
    expect(root.querySelector('input[aria-label="Custom label"]')).toHaveAccessibleName(
      'Custom label',
    );
    expect(root.querySelector('label input')).not.toHaveAttribute('aria-label');
  });

  it('distinguishes individual border sides without confusing corner controls', () => {
    const root = document.createElement('aside');
    root.innerHTML = `<div data-re-inspector-section>
      <button data-re-inspector-section-toggle>Border</button><div data-re-inspector-section-body>
      <div><div data-re-inspector-prop-row><label data-re-inspector-label>Border</label></div>
      ${['top', 'right', 'bottom', 'left']
        .map(
          (side) => `<div><div>
        <span><input></span><span><input type="color" data-re-inspector-color-trigger><input data-re-inspector-color-hex></span>
        </div><div><select><option>Solid</option></select><button aria-label="Clear ${side} border"></button></div></div>`,
        )
        .join('')}
      </div><div><div data-re-inspector-prop-row><label data-re-inspector-label>Rounded</label></div>
      <div><input><input><input><input></div></div></div></div>`;
    document.body.append(root);
    labelEmailInspector(root);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(root.querySelector(`input[aria-label="Border ${side} width"]`)).toBeInTheDocument();
      expect(
        root.querySelector(`input[aria-label="Border ${side} color picker"]`),
      ).toBeInTheDocument();
      expect(
        root.querySelector(`input[aria-label="Border ${side} color hex value"]`),
      ).toBeInTheDocument();
      expect(root.querySelector(`select[aria-label="Border ${side} style"]`)).toBeInTheDocument();
    }
    expect(
      Array.from(root.querySelectorAll('input'))
        .slice(-4)
        .map((el) => el.getAttribute('aria-label')),
    ).toEqual([
      'Border Rounded top left',
      'Border Rounded top right',
      'Border Rounded bottom left',
      'Border Rounded bottom right',
    ]);
    root.remove();
  });
});
