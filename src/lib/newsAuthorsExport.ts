/**
 * Export the admin news authors list (bylines and their article counts) to
 * Excel or CSV, honouring the list's current search.
 */
import { exportToCsv } from '@/utils/csvExport';
import { exportToExcel, generateFilename, type ExportColumnDef } from '@/utils/excelExport';
import { fetchAllNewsAuthors, type NewsAuthorRow } from '@/hooks/useNewsAuthorsAdmin';

export const NEWS_AUTHOR_EXPORT_COLUMNS: ExportColumnDef<NewsAuthorRow>[] = [
  { header: 'Author', accessor: (r) => r.author },
  { header: 'Articles', accessor: (r) => r.article_count },
];

export async function exportNewsAuthors(search: string, format: 'Excel' | 'CSV'): Promise<void> {
  const rows = await fetchAllNewsAuthors(search);
  const filename = generateFilename('news-authors');
  if (format === 'CSV') {
    exportToCsv(rows, NEWS_AUTHOR_EXPORT_COLUMNS, filename.replace(/\.xlsx$/, '.csv'));
  } else {
    await exportToExcel(rows, NEWS_AUTHOR_EXPORT_COLUMNS, filename);
  }
}
