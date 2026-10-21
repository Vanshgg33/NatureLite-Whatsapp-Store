import * as XLSX from 'xlsx';

export interface Sheet { name: string; rows: any[][] }

/** Build an .xlsx buffer from array-of-arrays sheets. Sheet names are used verbatim (<=31 chars). */
export function toXlsx(sheets: Sheet[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    const widest = s.rows.reduce((w, r) => Math.max(w, r.length), 0);
    ws['!cols'] = Array.from({ length: widest }, (_, c) => ({
      wch: Math.min(40, Math.max(10, ...s.rows.map(r => String(r[c] ?? '').length))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
