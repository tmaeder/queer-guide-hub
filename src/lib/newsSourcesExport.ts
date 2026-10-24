/**
 * Export the admin news sources list to Excel or CSV, honouring the list's
 * current search / status / publisher filters.
 */
import { exportToCsv } from '@/utils/csvExport';
import { exportToExcel, generateFilename, type ExportColumnDef } from '@/utils/excelExport';
import { formatDateTime } from '@/lib/format';
import {
  fetchAllNewsSources,
  type SourceFilters,
  type SourceRecord,
} from '@/hooks/useNewsSourcesAdmin';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const date = (v: string | null) => (v ? formatDateTime(v) : '');
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

export const NEWS_SOURCE_EXPORT_COLUMNS: ExportColumnDef<SourceRecord>[] = [
  { header: 'Name', accessor: (s) => text(s.name) },
  { header: 'URL', accessor: (s) => text(s.url) },
  { header: 'Publisher', accessor: (s) => text(s.publisher_name) },
  { header: 'Category', accessor: (s) => text(s.category) },
  { header: 'Source Type', accessor: (s) => text(s.source_type) },
  { header: 'Feed Type', accessor: (s) => text(s.feed_type) },
  { header: 'Fetch Frequency (min)', accessor: (s) => s.fetch_frequency },
  { header: 'Active', accessor: (s) => yesNo(s.is_active) },
  { header: 'Auto Publish', accessor: (s) => yesNo(s.auto_publish) },
  { header: 'Auto Paused', accessor: (s) => yesNo(s.auto_paused) },
  { header: 'Status', accessor: (s) => text(s.status) },
  { header: 'Articles', accessor: (s) => s.article_count },
  { header: 'Consecutive Failures', accessor: (s) => s.consecutive_failures },
  { header: 'Last Error', accessor: (s) => text(s.last_error) },
  { header: 'Last Fetched', accessor: (s) => date(s.last_fetched_at) },
  { header: 'Last Success', accessor: (s) => date(s.last_successful_fetch) },
  { header: 'Keywords', accessor: (s) => (s.keywords ?? []).join(', ') },
  { header: 'Created At', accessor: (s) => date(s.created_at) },
];

export async function exportNewsSources(
  filters: Omit<SourceFilters, 'page'>,
  format: 'Excel' | 'CSV',
): Promise<void> {
  const rows = await fetchAllNewsSources(filters);
  const filename = generateFilename('news-sources');
  if (format === 'CSV') {
    exportToCsv(rows, NEWS_SOURCE_EXPORT_COLUMNS, filename.replace(/\.xlsx$/, '.csv'));
  } else {
    await exportToExcel(rows, NEWS_SOURCE_EXPORT_COLUMNS, filename);
  }
}
