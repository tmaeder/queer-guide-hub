import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

// Read JSX, not source-text regexes: comments and pathless layouts must not
// accidentally publish routes. This is shared by the edge 404 guard and CI.
export function routeManifest(source) {
  const file = ts.createSourceFile(
    'routes.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const paths = new Set(['/']);
  const redirects = {};
  const attribute = (node, name) =>
    node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.text === name)
      ?.initializer;
  const literal = (value) => (value && ts.isStringLiteral(value) ? value.text : undefined);
  function visit(node, parent = '') {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(file) === 'Route') {
        let route = literal(attribute(opening, 'path'));
        if (route === '/:locale?') route = '';
        if (route === '*') return; // UI not-found handlers aren't valid URLs.
        const full = route?.startsWith('/') ? route : [parent, route].filter(Boolean).join('/');
        const path = '/' + full.replace(/^\/+|\/+$/g, '');
        if (route !== undefined || attribute(opening, 'index')) paths.add(path);
        const element = attribute(opening, 'element');
        if (
          element &&
          ts.isJsxExpression(element) &&
          element.expression &&
          ts.isJsxSelfClosingElement(element.expression)
        ) {
          const target = element.expression;
          const name = target.tagName.getText(file);
          const to = literal(attribute(target, 'to'));
          if (
            !path.startsWith('/admin') &&
            !path.includes(':') &&
            !path.includes('*') &&
            to?.startsWith('/') &&
            ['Navigate', 'LocalizedRedirect'].includes(name)
          ) {
            redirects[path] = {
              to,
              localized: name === 'LocalizedRedirect',
              preserveQuery: name === 'LocalizedRedirect',
            };
          }
        }
        if (ts.isJsxElement(node)) node.children.forEach((child) => visit(child, full));
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, parent));
  }
  visit(file);
  return { paths: [...paths].sort(), redirects };
}

const manifest = routeManifest(readFileSync('src/routes.tsx', 'utf8'));
manifest.functionPaths = readdirSync('functions', { recursive: true })
  .filter((name) => name.endsWith('.ts') && !/(^|\/)_|\.(test|spec)\.ts$/.test(name))
  .map(
    (name) =>
      '/' +
      name
        .replace(/\.ts$/, '')
        .replace(/\[\[[^\]]+\]\]/g, '*')
        .replace(/\[([^\]]+)\]/g, ':$1')
        .replace(/\/index$/, ''),
  )
  .sort();
const output = JSON.stringify(manifest, null, 2) + '\n';
const destination = 'functions/_lib/appRoutes.json';
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output)
    throw new Error('App routes changed: run node scripts/agent-route-manifest.mjs');
} else writeFileSync(destination, output);
