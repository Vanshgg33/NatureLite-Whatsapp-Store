// Client-side CSV download (blueprint G5). Cells starting with = + - @ are prefixed so Excel cannot run them as formulas.
const cell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(cell).join(',')).join('\r\n');

export function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' }); // BOM keeps ₹ and Hindi names intact in Excel
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
