import { BadRequestException } from '@nestjs/common';

export interface VendorInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  paymentTerms?: string;
  notes?: string;
}

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MOBILE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^[1-9]\d{5}$/;

/** Collapse whitespace; used for both storing and duplicate comparison. */
export const normalizeVendorName = (s: string) => (s || '').trim().replace(/\s+/g, ' ');

/** Trims every field, validates optional formats, returns the clean record (throws 400 on bad input). */
export function cleanVendorInput(data: VendorInput): Required<VendorInput> {
  const t = (v?: string) => (typeof v === 'string' ? v.trim() : '');
  const out = {
    name: normalizeVendorName(t(data?.name)),
    contactPerson: t(data.contactPerson),
    phone: t(data.phone).replace(/[\s-]/g, ''),
    email: t(data.email).toLowerCase(),
    address: t(data.address),
    city: t(data.city),
    state: t(data.state),
    pincode: t(data.pincode),
    gstin: t(data.gstin).toUpperCase(),
    paymentTerms: t(data.paymentTerms),
    notes: t(data.notes),
  };
  if (!out.name) throw new BadRequestException('Vendor name is required');
  if (out.name.length > 200) throw new BadRequestException('Vendor name is too long');
  if (out.phone && !MOBILE_RE.test(out.phone)) throw new BadRequestException('Enter a valid 10-digit mobile number');
  if (out.email && !EMAIL_RE.test(out.email)) throw new BadRequestException('Enter a valid email address');
  if (out.gstin && !GSTIN_RE.test(out.gstin)) throw new BadRequestException('Enter a valid 15-character GSTIN');
  if (out.pincode && !PIN_RE.test(out.pincode)) throw new BadRequestException('Enter a valid 6-digit PIN code');
  return out;
}

export { escapeRegex } from '../../../common/utils/query.util';
