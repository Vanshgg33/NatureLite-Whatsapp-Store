/** invoiceDate is date-only; the time of day lives in createdAt. Always shown in IST. */
export const billTime = (createdAt?: string) =>
  createdAt ? new Date(createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '';

export const billDate = (d: string, year: '2-digit' | 'numeric' = 'numeric') =>
  new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year });
