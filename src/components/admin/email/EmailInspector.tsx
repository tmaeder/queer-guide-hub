import { useEffect, useRef } from 'react';
import { Inspector } from '@react-email/editor/ui';

import { labelEmailInspector } from './emailInspectorAccessibility';

export default function EmailInspector() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const update = () => labelEmailInspector(root);
    update();
    const observer = new MutationObserver(update);
    // Ignore our attribute writes; watch selection-driven panels and mode changes.
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return (
    <Inspector.Root ref={ref} className="email-inspector" aria-label="Email properties">
      <h3 className="font-medium mb-4">Properties</h3>
      <Inspector.Breadcrumb />
      <Inspector.Document />
      <Inspector.Node />
      <Inspector.Text />
    </Inspector.Root>
  );
}
