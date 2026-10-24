/** Local, synthetic reproduction of the production News export shape. No DB calls. */
import { writeFile } from 'node:fs/promises';
import { streamingExcelBlob } from '../../src/utils/streamingExcel';

async function main() {
  const count = 58731;
  const rows = Array.from({ length: count }, (_, id) => ({ id }));
  const seed = 'News Zürich 日本語 🌈 & <article> content '.repeat(160);
  const columns = Array.from({ length: 62 }, (_, column) => ({
    header: column === 61 ? 'ID' : `Field ${column}`,
    accessor: (row: { id: number }) =>
      column === 61
        ? String(row.id)
        : column === 10
          ? `${row.id}: ${seed}${row.id < 354 ? seed.repeat(6) : ''}`
          : column % 3 === 0
            ? row.id
            : `Value ${row.id} / ${column}`,
  }));
  const started = performance.now();
  const blob = await streamingExcelBlob([{ name: 'Data', rows, columns }]);
  const destination = process.argv[2];
  if (!destination) throw new Error('Provide an output XLSX path');
  await writeFile(destination, new Uint8Array(await blob.arrayBuffer()));
  console.log(
    JSON.stringify({
      rows: count,
      original_columns: 62,
      elapsed_ms: performance.now() - started,
      bytes: blob.size,
      memory: process.memoryUsage(),
      max_rss_kib: process.resourceUsage().maxRSS,
    }),
  );
}
void main();
