import ts from 'typescript';
import fs from 'node:fs';
const config = ts.readConfigFile('tsconfig.app.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, parsed.options);
const targets = [
  ...fs
    .readdirSync('src/lib/knowledge')
    .filter((x) => x.endsWith('.ts'))
    .map((x) => 'src/lib/knowledge/' + x),
  ...fs
    .readdirSync('src/components/knowledge')
    .filter((x) => x.endsWith('.tsx'))
    .map((x) => 'src/components/knowledge/' + x),
  'src/hooks/knowledge/useKnowledgeEditorial.ts',
  'src/pages/admin/AdminKnowledgeEditorial.tsx',
  'src/pages/TagDetail.tsx',
  'src/pages/PersonalityDetail.parts.tsx',
];
const errors = [];
for (const target of targets) {
  const file = program.getSourceFile(target);
  if (!file) throw new Error('Missing ' + target);
  errors.push(...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file));
}
console.log(
  ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (x) => x,
    getNewLine: () => '\n',
  }),
);
console.log(JSON.stringify({ files: targets.length, errors: errors.length }));
if (errors.length) process.exitCode = 1;
