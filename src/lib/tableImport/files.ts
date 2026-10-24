export const MAX_IMPORT_ROWS = 20000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export interface ImportSheet {
  name: string;
  headers: string[];
  rows: string[][];
  rowNumbers?: number[];
}

function sheet(name: string, matrix: string[][]): ImportSheet {
  const numbered = matrix
    .map((row, i) => ({ row, number: i + 1 }))
    .filter(({ row }) => row.some((cell) => cell.trim() !== ''));
  const filled = numbered.map(({ row }) => row);
  if (filled.length < 2) throw new Error('Include a header and at least one data row.');
  const headers = filled[0].map((h) => h.trim());
  if (headers.some((h) => !h)) throw new Error('Every column needs a header.');
  if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length)
    throw new Error('Column headers must be unique.');
  if (headers.length > 200) throw new Error('Upload at most 200 columns.');
  if (filled.length - 1 > MAX_IMPORT_ROWS)
    throw new Error(`Upload at most ${MAX_IMPORT_ROWS} rows at a time.`);
  for (let i = 1; i < filled.length; i++) {
    if (filled[i].length !== headers.length)
      throw new Error(
        `Row ${numbered[i].number} has ${filled[i].length} cells; expected ${headers.length}.`,
      );
  }
  return {
    name,
    headers,
    rows: filled.slice(1),
    rowNumbers: numbered.slice(1).map(({ number }) => number),
  };
}

/** Delimiters inside quotes and escaped quotes never split a cell. */
export function parseDelimited(text: string, delimiter: string): ImportSheet {
  if (text.includes('\0')) throw new Error('The file contains invalid NUL characters.');
  const input = text.replace(/^\uFEFF/, '');
  const matrix: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };
  const endRow = () => {
    endCell();
    matrix.push(row);
    row = [];
    if (matrix.length > MAX_IMPORT_ROWS + 2)
      throw new Error(`Upload at most ${MAX_IMPORT_ROWS} rows.`);
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === delimiter) endCell();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      endRow();
    } else if (closed) {
      if (c !== ' ' && c !== '\t') throw new Error('Unexpected text after a closing quote.');
    } else if (c === '"') {
      if (cell.length) throw new Error('A quote must start a field.');
      quoted = true;
    } else cell += c;
  }
  if (quoted) throw new Error('The file contains an unclosed quoted field.');
  if (cell || row.length || closed) endRow();
  return sheet('Text file', matrix);
}

export function detectDelimiter(text: string): string {
  const counts = new Map([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && (c === '\r' || c === '\n')) break;
    else if (!quoted && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export async function readImportFile(file: File): Promise<ImportSheet[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Upload a file of 10 MB or less.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (['csv', 'tsv', 'txt'].includes(extension ?? '')) {
    const text = await file.text();
    return [parseDelimited(text, extension === 'tsv' ? '\t' : detectDelimiter(text))];
  }
  if (extension !== 'xlsx') throw new Error('Choose a CSV, TSV or Excel (.xlsx) file.');
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets: ImportSheet[] = [];
  workbook.eachSheet((ws) => {
    if (ws.state !== 'visible' || !ws.actualRowCount) return;
    if (ws.rowCount > MAX_IMPORT_ROWS + 1 || ws.columnCount > 200)
      throw new Error(`${ws.name}: upload at most ${MAX_IMPORT_ROWS} rows and 200 columns.`);
    const matrix: string[][] = [];
    for (let index = 1; index <= ws.rowCount; index++) {
      const values: string[] = [];
      for (let col = 1; col <= ws.columnCount; col++) {
        const value = ws.getCell(index, col).value;
        if (value == null) values.push('');
        else if (value instanceof Date) values.push(value.toISOString());
        else if (typeof value === 'object') {
          if ('formula' in value || 'sharedFormula' in value)
            throw new Error(
              `${ws.name}, row ${index}: replace formulas with values before importing.`,
            );
          if ('richText' in value) values.push(value.richText.map((v) => v.text).join(''));
          else if ('text' in value) values.push(String(value.text));
          else throw new Error(`${ws.name}, row ${index}: unsupported Excel cell.`);
        } else {
          if (
            typeof value === 'number' &&
            (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
          )
            throw new Error(
              `${ws.name}, row ${index}: this number exceeds spreadsheet precision. Store identifiers as text.`,
            );
          values.push(String(value));
        }
      }
      matrix.push(values);
    }
    sheets.push(sheet(ws.name, matrix));
  });
  if (!sheets.length) throw new Error('The workbook has no visible data sheets.');
  return sheets;
}
