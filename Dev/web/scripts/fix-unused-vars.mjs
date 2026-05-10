#!/usr/bin/env node
/**
 * Fix unused-imports/no-unused-vars warnings by prefixing unused identifiers with _
 * Reads pre-generated JSON eslint output from stdin or a file argument.
 *
 * Usage: node scripts/fix-unused-vars.mjs path/to/eslint-json-output.txt
 */
import { readFileSync, writeFileSync } from 'fs';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node scripts/fix-unused-vars.mjs <eslint-json-output-file>');
  process.exit(1);
}

const raw = readFileSync(jsonPath, 'utf-8');
const results = JSON.parse(raw);

let totalFixed = 0;
let filesFixed = 0;

for (const result of results) {
  const unusedWarnings = result.messages.filter(
    (m) => m.ruleId === 'unused-imports/no-unused-vars' && m.severity <= 1
  );
  if (unusedWarnings.length === 0) continue;

  let lines;
  try {
    lines = readFileSync(result.filePath, 'utf-8').split('\n');
  } catch (e) {
    console.error(`ERROR reading ${result.filePath}: ${e.message}`);
    continue;
  }

  // Extract variable name from the message
  function extractVarName(msg) {
    const m = msg.match(/^'(\w+)'/);
    return m ? m[1] : null;
  }

  // Group by line, sort by column descending
  const byLine = new Map();
  for (const w of unusedWarnings) {
    const name = extractVarName(w.message);
    if (!name || name.startsWith('_')) continue;
    if (!byLine.has(w.line)) byLine.set(w.line, []);
    byLine.get(w.line).push({ col: w.column, name });
  }

  let modified = false;

  for (const [lineNum, fixes] of byLine) {
    if (lineNum > lines.length) continue;
    let line = lines[lineNum - 1];
    fixes.sort((a, b) => b.col - a.col);

    for (const { col, name } of fixes) {
      const newName = '_' + name;
      const idx = col - 1;

      // Try exact position first
      if (idx >= 0 && idx < line.length && line.substring(idx, idx + name.length) === name) {
        const before = idx === 0 || !/[\w]/.test(line[idx - 1]);
        const afterIdx = idx + name.length;
        const after = afterIdx >= line.length || !/[\w]/.test(line[afterIdx]);
        if (before && after) {
          line = line.substring(0, idx) + newName + line.substring(idx + name.length);
          lines[lineNum - 1] = line;
          modified = true;
          totalFixed++;
          continue;
        }
      }

      // Fallback: regex
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![_\\w])${escaped}(?![_\\w])`);
      const match = re.exec(line);
      if (match) {
        const s = match.index;
        line = line.substring(0, s) + newName + line.substring(s + name.length);
        lines[lineNum - 1] = line;
        modified = true;
        totalFixed++;
      } else {
        console.warn(`WARN: '${name}' not found on line ${lineNum} of ${result.filePath}`);
      }
    }
  }

  if (modified) {
    writeFileSync(result.filePath, lines.join('\n'));
    filesFixed++;
    console.log(`Fixed ${result.filePath} (${unusedWarnings.length} warnings)`);
  }
}

console.log(`\nDone: ${totalFixed} vars fixed across ${filesFixed} files`);
