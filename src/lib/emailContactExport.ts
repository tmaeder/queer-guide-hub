import { supabase } from '@/integrations/supabase/client';
import { exportToCsv } from '@/utils/csvExport';
import { exportToExcel, type ExportColumnDef } from '@/utils/excelExport';

type Contact = {
  id: string;
  email: string;
  status: string;
  locale: string;
  topics: string[];
  source: string;
  confirmed_at: string | null;
};
const columns: ExportColumnDef<Contact>[] = [
  { header: 'email', accessor: (row) => row.email },
  { header: 'status', accessor: (row) => row.status },
  { header: 'locale', accessor: (row) => row.locale },
  { header: 'topics', accessor: (row) => row.topics.join('|') },
  { header: 'source', accessor: (row) => row.source },
  { header: 'confirmed_at', accessor: (row) => row.confirmed_at },
];

/** Use the guarded export projection, starting before the first contact. */
export async function exportEmailContacts(format: 'Excel' | 'CSV') {
  const rows: Contact[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  do {
    const result = await supabase.functions.invoke(
      `email-admin?resource=contacts&format=csv${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      { method: 'GET' },
    );
    if (result.error || !Array.isArray(result.data?.contacts))
      throw new Error('Contact export failed');
    rows.push(...result.data.contacts);
    const next: unknown = result.data.next;
    if (
      next !== null &&
      (typeof next !== 'string' || !next || cursors.has(next) || !result.data.contacts.length)
    ) {
      throw new Error('Contact export pagination did not advance');
    }
    after = next as string | null;
    if (after) cursors.add(after);
  } while (after);
  if (rows.some((row) => !row.id) || new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error('Duplicate contacts in export. Please retry.');
  if (format === 'CSV') exportToCsv(rows, columns, 'queer-guide-email-contacts.csv');
  else await exportToExcel(rows, columns, 'queer-guide-email-contacts.xlsx');
}
