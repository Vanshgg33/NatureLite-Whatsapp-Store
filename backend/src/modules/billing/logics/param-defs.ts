/** Editable values on the Logics page. Stored as effective-dated ComplianceParam rows; `default` is used until one exists. */
export interface ParamDef {
  key: string;
  module: string;
  label: string;
  help: string;
  unit: 'paise' | 'text';
  kind: 'int' | 'intList';
  default: number | string;
  min?: number;
}

export const PARAM_DEFS: ParamDef[] = [
  { key: 'b2clThreshold', module: 'GSTR-1', label: 'B2CL invoice limit', unit: 'paise', kind: 'int', min: 0, default: 10_000_000,
    help: 'Unregistered-customer, other-state bills above this amount go to B2CL; all others to B2CS. 10000000 paise = ₹1,00,000.' },
  { key: 'gstr2bTolerancePaise', module: 'GSTR-2B reconciliation', label: 'Tax difference allowed', unit: 'paise', kind: 'int', min: 0, default: 2,
    help: 'A supplier invoice still counts as matched when tax differs by no more than this.' },
  { key: 'whatsappRetryDelaysSec', module: 'WhatsApp bill sending', label: 'Retry delays (seconds)', unit: 'text', kind: 'intList', default: '60,300,1800,7200',
    help: 'Wait before each retry of a failed bill message, comma separated. After the last one the bill shows "failed".' },
];

export const paramDef = (key: string) => PARAM_DEFS.find(p => p.key === key);

/** Returns the cleaned value, or an error message. */
export function checkParamValue(def: ParamDef, raw: unknown): { value: number | string } | { error: string } {
  if (def.kind === 'int') {
    const n = Number(raw);
    if (raw === '' || raw === null || !Number.isInteger(n) || n < (def.min ?? 0)) return { error: `${def.label} must be a whole number, ${def.min ?? 0} or more` };
    return { value: n };
  }
  const parts = String(raw ?? '').split(',').map(s => s.trim());
  const nums = parts.map(Number);
  if (parts.length < 1 || parts.length > 8 || nums.some(n => !Number.isInteger(n) || n < 1)) return { error: `${def.label} must be 1 to 8 whole numbers above 0, separated by commas` };
  return { value: nums.join(',') };
}

export const parseIntList = (v: unknown, fallback: number[]): number[] => {
  const n = String(v ?? '').split(',').map(Number);
  return n.length && n.every(x => Number.isInteger(x) && x > 0) ? n : fallback;
};
