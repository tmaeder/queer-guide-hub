import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { KnowledgeDiagram } from '../../src/components/knowledge/KnowledgeDiagram';
import { PILOT_FIGURES } from '../../src/lib/knowledge/pilotFigures';
await mkdir('docs/knowledge/figures', { recursive: true });
for (const figure of PILOT_FIGURES) {
  const svg = renderToStaticMarkup(React.createElement(KnowledgeDiagram, { figure })).replace(
    '<svg ',
    '<svg role="img" aria-label="' +
      figure.summary.replaceAll('&', '&amp;').replaceAll('"', '&quot;') +
      '" ',
  );
  await writeFile(
    `docs/knowledge/figures/${figure.id}.svg`,
    svg.replace(' aria-hidden="true"', '') + '\n',
  );
}
console.log('Exported six reviewable SVG figures from the production renderer.');
