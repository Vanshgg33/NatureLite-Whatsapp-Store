const INR = new Intl.NumberFormat('en-IN');

export const EM = '\u2003';

export const money = (n: number): string => {
  const safe = Number.isFinite(n) ? n : 0;
  const rounded = Math.round(safe * 100) / 100;
  return `\u20B9${INR.format(rounded)}`;
};

export const bold = (s: string) => `*${s}*`;
export const italic = (s: string) => `_${s}_`;
export const strike = (s: string) => `~${s}~`;

export const kv = (label: string, value: string, weight: 'normal' | 'bold' = 'normal') =>
  `${label}${EM}${weight === 'bold' ? bold(value) : value}`;

export const bullet = (items: string[]) => items.map((l) => `\u2022 ${l}`).join('\n');

export const firstName = (full?: string): string => {
  const n = (full || '').trim().split(/\s+/)[0];
  return n || 'there';
};
