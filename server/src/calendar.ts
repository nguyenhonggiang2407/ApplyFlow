import { createHash } from 'node:crypto';
import type { Application, Task } from '../../shared/types.js';

// RFC 5545 TEXT: escape before folding, and never split a UTF-8 character.
function text(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}
function fold(line: string) {
  let output = '',
    width = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, 'utf8');
    if (width + bytes > 75) {
      output += '\r\n ';
      width = 1;
    }
    output += char;
    width += bytes;
  }
  return output;
}
const stamp = (value: string) =>
  new Date(value).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const day = (value: string) => value.replaceAll('-', '');
function nextDay(value: string) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return day(date.toISOString().slice(0, 10));
}
export function exportCalendar(
  owner: number,
  applications: Application[],
  tasks: Task[],
  now = new Date(),
) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ApplyFlow//Application calendar//VI',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:ApplyFlow',
  ];
  const active = new Map(applications.filter((a) => a.status !== 'closed').map((a) => [a.id, a]));
  const add = (
    kind: string,
    id: number,
    createdAt: string,
    updatedAt: string,
    date: string,
    summary: string,
    description: string,
  ) => {
    // Record creation time also distinguishes a deleted row from a later reused SQLite ID.
    const uid = createHash('sha256').update(`${owner}:${kind}:${id}:${createdAt}`).digest('hex');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@applyflow.local`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `CREATED:${stamp(createdAt)}`,
      `LAST-MODIFIED:${stamp(updatedAt)}`,
      `DTSTART;VALUE=DATE:${day(date)}`,
      `DTEND;VALUE=DATE:${nextDay(date)}`,
      `SUMMARY:${text(summary)}`,
      `DESCRIPTION:${text(description)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  };
  for (const a of active.values())
    if (a.deadline) {
      add(
        'application',
        a.id,
        a.createdAt,
        a.updatedAt,
        a.deadline,
        `Hạn ứng tuyển · ${a.company}`,
        `${a.role}\n${a.location}`,
      );
    }
  for (const task of tasks) {
    const a = active.get(task.applicationId);
    if (a && !task.completed && task.dueDate) {
      add(
        'task',
        task.id,
        task.createdAt,
        task.createdAt,
        task.dueDate,
        task.title,
        `${a.company} · ${a.role}`,
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
