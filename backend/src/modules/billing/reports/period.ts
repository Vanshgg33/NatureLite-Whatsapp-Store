/** IST date helpers + GST state names for the reports engine. All dates are Asia/Kolkata. */

const IST_MS = 5.5 * 60 * 60 * 1000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '96': 'Foreign Country', '97': 'Other Territory',
};

export const stateName = (code: string) => STATE_NAMES[code] ?? code;
export const stateLabel = (code: string) => `${code}-${stateName(code)}`;

const pad = (n: number) => String(n).padStart(2, '0');
const ist = (d: Date) => new Date(d.getTime() + IST_MS);

/** 'YYYY-MM-DD' -> UTC instant of 00:00 IST that day */
export function startOfDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${ymd}`);
  return new Date(Date.UTC(y, m - 1, d) - IST_MS);
}

/** Inclusive from/to days -> [start, endExclusive) */
export function dayRange(from: string, to: string): { start: Date; end: Date } {
  return { start: startOfDay(from), end: new Date(startOfDay(to).getTime() + 86_400_000) };
}

/** 'YYYY-MM' -> [start, endExclusive) of that IST month */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) throw new Error(`Invalid month: ${month}`);
  return { start: new Date(Date.UTC(y, m - 1, 1) - IST_MS), end: new Date(Date.UTC(y, m, 1) - IST_MS) };
}

export const fmtDMY = (d: Date) => { const x = ist(d); return `${pad(x.getUTCDate())}/${pad(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`; };
export const fmtDMonY = (d: Date) => { const x = ist(d); return `${pad(x.getUTCDate())}-${MON[x.getUTCMonth()]}-${x.getUTCFullYear()}`; };
export const fmtMonthYear = (month: string) => { const [y, m] = month.split('-').map(Number); return `${MONTH_FULL[m - 1]} ${y}`; };
export const fmtMMYYYY = (month: string) => { const [y, m] = month.split('-'); return `${m}/${y}`; };
/** dd_MM_yy used in export filenames */
export const fileDay = (ymd: string) => { const [y, m, d] = ymd.split('-'); return `${d}_${m}_${y.slice(2)}`; };
/** ymd -> dd/MM/yyyy without timezone maths */
export const ymdToDMY = (ymd: string) => { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}`; };

export const todayYmd = () => { const x = ist(new Date()); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };

/** paise (integer, summed unrounded) -> rupees at 2dp */
export const rs = (paise: number) => Math.round(paise) / 100;
