import { parseDate } from '../src/utils/dates.js';

const tests = [
  'Friday 27th February 2026 at 7:00 PM',
  'Tuesday 17th March 2026 at 6:30 PM',
  'Saturday 21st February 2026 at various times',
  'Thursday 26th February 2026 at 3:30 PM',
  'Friday 20th February 2026 at 1:00 PM',
  'Saturday 1st March 2026 at 10:00 AM',
  'Wednesday 2nd April 2026 at 8:00 PM',
  'Sunday 3rd May 2026 at 2:00 PM',
];
for (const t of tests) {
  const d = parseDate(t);
  console.log(d ? '✅' : '❌', t, '→', d?.toISOString() || 'NULL');
}
