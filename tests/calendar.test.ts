import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportCalendar } from '../server/src/calendar.js';
import type { Application, Task } from '../shared/types.js';

const app: Application = {
  id: 1,
  company: 'Công ty mẫu',
  role: 'Backend Intern',
  location: 'Hà Nội',
  workMode: 'hybrid',
  status: 'saved',
  url: '',
  deadline: '2028-02-29',
  appliedOn: '',
  notes: 'Private notes are not part of the calendar.',
  version: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
};
const task: Task = {
  id: 1,
  applicationId: 1,
  title: 'Ôn tập SQL',
  dueDate: '2028-02-28',
  completed: false,
  createdAt: app.createdAt,
};
const now = new Date('2026-11-03T00:00:00.000Z');
const unfolded = (ics: string) => ics.replace(/\r\n /g, '');
const uids = (ics: string) => unfolded(ics).match(/^UID:.+$/gm);

test('calendar uses complete all-day dates across leap years and year boundaries', () => {
  const ics = exportCalendar(1, [app], [task], now);
  assert(ics.includes('DTSTART;VALUE=DATE:20280229\r\nDTEND;VALUE=DATE:20280301'));
  assert(ics.includes('DTSTART;VALUE=DATE:20280228\r\nDTEND;VALUE=DATE:20280229'));
  const end = exportCalendar(1, [{ ...app, deadline: '2100-12-31' }], [], now);
  assert(end.includes('DTEND;VALUE=DATE:21010101'));
  const century = exportCalendar(1, [{ ...app, deadline: '2100-02-28' }], [], now);
  assert(century.includes('DTEND;VALUE=DATE:21000301'));
  assert(ics.endsWith('END:VCALENDAR\r\n'));
});
test('calendar folds UTF-8 into 75-octet lines and escapes property injection', () => {
  const title =
    'Phỏng vấn 🎯 Ứng tuyển; \\ SQL, REST\r\nBEGIN:VEVENT\nUID:evil ' + 'Tiếng Việt '.repeat(15);
  const ics = exportCalendar(1, [app], [{ ...task, title }], now);
  for (const line of ics.split('\r\n')) assert(Buffer.byteLength(line, 'utf8') <= 75);
  assert.equal(ics.match(/BEGIN:VEVENT\r\n/g)?.length, 2);
  assert.equal(uids(ics)?.length, 2);
  assert(!ics.includes('\ufffd'));
  assert(
    unfolded(ics).includes(
      'SUMMARY:Phỏng vấn 🎯 Ứng tuyển\\; \\\\ SQL\\, REST\\nBEGIN:VEVENT\\nUID:evil',
    ),
  );
});
test('calendar skips closed applications, finished tasks and undated records', () => {
  const closed = { ...app, id: 2, status: 'closed' as const };
  const ics = exportCalendar(
    1,
    [app, closed, { ...app, id: 3, deadline: '' }],
    [
      task,
      { ...task, id: 2, completed: true },
      { ...task, id: 3, dueDate: '' },
      { ...task, id: 4, applicationId: 2 },
      { ...task, id: 5, applicationId: 999 },
    ],
    now,
  );
  assert.equal(uids(ics)?.length, 2);
  assert(!ics.includes(app.notes));
});
test('calendar UID survives edits and separates users, entity kinds and reused IDs', () => {
  const original = uids(exportCalendar(1, [app], [task], now))!;
  const edited = uids(
    exportCalendar(
      1,
      [{ ...app, company: 'Renamed', deadline: '2030-01-01', version: 2 }],
      [{ ...task, title: 'Edited', dueDate: '2030-01-01' }],
      now,
    ),
  );
  assert.deepEqual(original, edited);
  assert.notEqual(original[0], original[1]);
  assert.notEqual(original[0], uids(exportCalendar(2, [app], [], now))![0]);
  assert.notEqual(
    original[0],
    uids(exportCalendar(1, [{ ...app, createdAt: '2026-11-03T10:00:00.000Z' }], [], now))![0],
  );
});
test('an empty calendar is still a complete importable iCalendar document', () => {
  const ics = exportCalendar(1, [], [], now);
  assert(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert(!ics.includes('BEGIN:VEVENT'));
  assert(!/(^|[^\r])\n/.test(ics));
});
