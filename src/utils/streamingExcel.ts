import { Zip, ZipDeflate, strToU8 } from 'fflate';
import type { ExportColumnDef } from './excelExport';

const CELL_LIMIT = 32767;
const ROW_LIMIT = 1048576;
const COLUMN_LIMIT = 16384;
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

type Value = string | number | boolean | null | undefined;
export interface StreamingSheet<T> {
  name: string;
  rows: T[];
  columns: ExportColumnDef<T>[];
}

/** Excel counts UTF-16 units. Do not split an emoji across continuation cells. */
export function* textParts(text: string): Generator<string> {
  if (!text.length) {
    yield '';
    return;
  }
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + CELL_LIMIT, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    yield text.slice(start, end);
    start = end;
  }
}

function xml(text: string): string {
  // Escape literal OOXML escape sequences before encoding XML-illegal controls.
  return (
    text
      .replace(/_x[0-9a-f]{4}_/gi, (match) => `_x005F_${match.slice(1)}`)
      // XML 1.0 excludes these controls; OOXML escape sequences preserve them.
      .replace(
        // eslint-disable-next-line no-control-regex
        /[\x00-\x08\x0b\x0c\x0e-\x1f\r\ufffe\uffff]/g,
        (char) => `_x${char.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}_`,
      )
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

function columnName(index: number): string {
  let name = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function cell(value: Value, address: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${address}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') return `<c r="${address}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xml(String(value ?? ''))}</t></is></c>`;
}

export function needsStreamingExcel<T>(rows: T[], columns: ExportColumnDef<T>[]): boolean {
  if (rows.length * columns.length >= 100000) return true;
  return rows.some((row) =>
    columns.some((col) => {
      const value = col.accessor(row);
      return typeof value === 'string' && value.length > CELL_LIMIT;
    }),
  );
}

/** Bounded worksheet XML chunks; no workbook-sized cell graph or shared strings. */
export async function streamingExcelBlob<T>(sheets: StreamingSheet<T>[]): Promise<Blob> {
  const chunks: BlobPart[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((error, bytes) => {
    if (error) zipError = error;
    else chunks.push(bytes as BlobPart);
  });
  const metadata: Array<{ sheet: string; column: number; header: string; parts: number }> = [];
  const used = new Set(sheets.map((sheet) => sheet.name.toLowerCase()));
  let metadataName = 'Export columns';
  for (let i = 2; used.has(metadataName.toLowerCase()); i++) metadataName = `Export columns (${i})`;
  const names = sheets.map((sheet) => sheet.name);
  const add = (name: string, contents: string) => {
    const entry = new ZipDeflate(name, { level: 1 });
    zip.add(entry);
    entry.push(strToU8(contents), true);
    if (zipError) throw zipError;
  };
  let sinceYield = performance.now();
  const yieldIfNeeded = async () => {
    if (performance.now() - sinceYield >= 16) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sinceYield = performance.now();
    }
  };
  try {
    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
      const sheet = sheets[sheetIndex];
      if (sheet.rows.length + 1 > ROW_LIMIT)
        throw new Error('Excel worksheet row limit exceeded. Use CSV.');
      const counts = sheet.columns.map(() => 1);
      for (const row of sheet.rows) {
        sheet.columns.forEach((col, index) => {
          const value = col.accessor(row);
          if (typeof value === 'string' && value.length > CELL_LIMIT) {
            let count = 0;
            for (const part of textParts(value)) count += part.length > 0 ? 1 : 0;
            counts[index] = Math.max(counts[index], count);
          }
        });
        await yieldIfNeeded();
      }
      const columnCount = counts.reduce((sum, count) => sum + count, 0);
      if (columnCount > COLUMN_LIMIT)
        throw new Error('Excel worksheet column limit exceeded. Use CSV.');
      const entry = new ZipDeflate(`xl/worksheets/sheet${sheetIndex + 1}.xml`, { level: 1 });
      zip.add(entry);
      let pending = '';
      const push = (text: string, final = false) => {
        pending += text;
        if (pending.length >= 65536 || final) {
          entry.push(strToU8(pending), final);
          pending = '';
          if (zipError) throw zipError;
        }
      };
      push(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><dimension ref="A1:${columnName(Math.max(0, columnCount - 1))}${sheet.rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>`,
      );
      const headers: string[] = [];
      sheet.columns.forEach((col, index) => {
        for (let part = 0; part < counts[index]; part++) {
          headers.push(part ? `${col.header} (continued ${part + 1})` : col.header);
        }
        if (counts[index] > 1)
          metadata.push({
            sheet: sheet.name,
            column: index + 1,
            header: col.header,
            parts: counts[index],
          });
      });
      push(
        `<row r="1">${headers.map((header, index) => cell(header, `${columnName(index)}1`)).join('')}</row>`,
      );
      for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
        const rowNumber = rowIndex + 2;
        push(`<row r="${rowNumber}">`);
        let outputColumn = 0;
        for (let index = 0; index < sheet.columns.length; index++) {
          const value = sheet.columns[index].accessor(sheet.rows[rowIndex]);
          const parts = typeof value === 'string' ? textParts(value) : [value][Symbol.iterator]();
          for (let part = 0; part < counts[index]; part++) {
            push(cell(parts.next().value, `${columnName(outputColumn++)}${rowNumber}`));
          }
        }
        push('</row>');
        await yieldIfNeeded();
      }
      push('</sheetData></worksheet>', true);
    }
    if (metadata.length) {
      names.push(metadataName);
      const rows = [
        ['Sheet', 'Source column', 'Header', 'Parts'],
        ...metadata.map((m) => [m.sheet, m.column, m.header, m.parts]),
      ];
      add(
        `xl/worksheets/sheet${names.length}.xml`,
        `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((value, j) => cell(value, `${columnName(j)}${i + 1}`)).join('')}</row>`).join('')}</sheetData></worksheet>`,
      );
    }
    add(
      '[Content_Types].xml',
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    );
    add(
      '_rels/.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    );
    add(
      'xl/workbook.xml',
      `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${names.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    );
    add(
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    );
    zip.end();
    if (zipError) throw zipError;
    return new Blob(chunks, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  } catch (error) {
    zip.terminate();
    throw error;
  }
}
