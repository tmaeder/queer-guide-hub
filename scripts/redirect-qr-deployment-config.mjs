import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

// Use the same public production fallback as the shipped application. Never
// import the browser client in Node or give the image renderer a service key.
const source = ts.createSourceFile(
  'client.ts',
  readFileSync('src/integrations/supabase/client.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
function fallback(name) {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) !== name) continue;
      const value = declaration.initializer;
      if (
        value &&
        ts.isBinaryExpression(value) &&
        value.operatorToken.kind === ts.SyntaxKind.BarBarToken &&
        ts.isStringLiteral(value.right)
      )
        return value.right.text;
    }
  }
  throw new Error('Cannot find the public production ' + name + ' fallback');
}
const url = fallback('SUPABASE_URL');
const key = fallback('SUPABASE_PUBLISHABLE_KEY');
const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
if (claims.role !== 'anon' || url !== `https://${claims.ref}.supabase.co`)
  throw new Error('QR deployment requires the matching public anon project key');
const configPath = 'workers/redirect-qr/wrangler.jsonc';
const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, 'utf8'));
if (parsed.error) throw new Error('Invalid QR Worker configuration');
const config = parsed.config;
const output = resolve('workers/redirect-qr/tmp/deploy.wrangler.json');
config.main = relative(dirname(output), resolve(dirname(configPath), config.main));
config.vars = { ...config.vars, SUPABASE_URL: url, SUPABASE_ANON_KEY: key };
delete config.$schema;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(config, null, 2) + '\n');
console.log('Prepared the QR Worker with the application public project configuration');
