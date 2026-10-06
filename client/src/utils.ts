import type { Application } from '../../shared/types';
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dateLabel(value: string) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(`${value}T12:00:00`))
    : 'Chưa đặt ngày';
}
export function daysUntil(value: string) {
  return Math.round(
    (new Date(`${value}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) /
      86400000,
  );
}
export function dueLabel(value: string) {
  if (!value) return 'Chưa đặt hạn';
  const days = daysUntil(value);
  return days < 0
    ? `Quá hạn ${Math.abs(days)} ngày`
    : days === 0
      ? 'Hôm nay'
      : days === 1
        ? 'Ngày mai'
        : days <= 7
          ? `Còn ${days} ngày`
          : dateLabel(value);
}
export function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
export function csvCell(value: string) {
  // Spreadsheet formula injection protection also covers leading whitespace/control characters.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportApplications(items: Application[]) {
  const rows = [
    [
      'Company',
      'Role',
      'Location',
      'Work mode',
      'Status',
      'Deadline',
      'Applied on',
      'URL',
      'Notes',
    ],
    ...items.map((item) => [
      item.company,
      item.role,
      item.location,
      item.workMode,
      item.status,
      item.deadline,
      item.appliedOn,
      item.url,
      item.notes,
    ]),
  ];
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `applyflow-${today()}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
