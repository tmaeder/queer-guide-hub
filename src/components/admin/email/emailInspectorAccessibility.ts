const sectionSelector = '[data-re-inspector-section]';
const rowSelector = '[data-re-inspector-prop-row]';
const labelSelector = '[data-re-inspector-label]';

/** The pinned editor renders visual labels without associating its controls.
 * Keep this adapter scoped to its inspector; never change the email document.
 */
export function labelEmailInspector(root: HTMLElement) {
  for (const section of root.querySelectorAll(sectionSelector)) {
    const toggle = section.querySelector('[data-re-inspector-section-toggle]');
    toggle?.setAttribute(
      'aria-expanded',
      String(!!section.querySelector('[data-re-inspector-section-body]')),
    );
  }
  for (const control of root.querySelectorAll<HTMLElement>(
    'input, select, button, [role="group"]',
  )) {
    if (control.hasAttribute('aria-labelledby')) continue;
    if (control instanceof HTMLInputElement && control.labels?.length) continue;
    if (control instanceof HTMLSelectElement && control.labels?.length) continue;
    if (control.hasAttribute('aria-label') && !control.hasAttribute('data-email-inspector-label'))
      continue;
    const section = control.closest(sectionSelector);
    const title =
      section?.querySelector('[data-re-inspector-section-toggle]')?.textContent?.trim() ?? '';
    let field = control.closest(rowSelector);
    // Per-side spacing and corner fields sit below their visual label row.
    if (!field) {
      let parent = control.parentElement;
      while (parent && parent !== section && !parent.querySelector(labelSelector))
        parent = parent.parentElement;
      field = parent;
    }
    const label = field?.querySelector(labelSelector)?.textContent?.trim() ?? '';
    let name = [title, label !== title ? label : ''].filter(Boolean).join(' ');
    if (control.matches('button')) {
      if (control.textContent?.trim()) continue;
      const tooltip = control
        .closest('[data-re-inspector-tooltip]')
        ?.querySelector('[data-re-inspector-tooltip-content]')
        ?.textContent?.trim();
      if (!tooltip) continue;
      name = [name, tooltip].filter(Boolean).join(' ');
    } else if (control.matches('input, select') && field) {
      const peers = Array.from(field.querySelectorAll('input, select'));
      const index = peers.indexOf(control);
      if (control.matches('[data-re-inspector-color-trigger]')) name += ' color picker';
      else if (control.matches('[data-re-inspector-color-hex]')) name += ' hex value';
      else if (peers.length === 4 && /^(Padding|Margin|Rounded)$/.test(label)) {
        const sides =
          label === 'Rounded'
            ? ['top left', 'top right', 'bottom left', 'bottom right']
            : ['top', 'right', 'bottom', 'left'];
        name += ` ${sides[index]}`;
      } else if (peers.length > 1) name += ` value ${index + 1}`;
    }
    if (name) {
      control.setAttribute('aria-label', name);
      control.setAttribute('data-email-inspector-label', '');
    }
  }
}
