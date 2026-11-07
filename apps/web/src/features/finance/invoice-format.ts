import type { Invoice, PrintHeader } from './account-api';

export type PrintableInvoice = Invoice & { shipment: PrintHeader };

export const printDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' }).format(new Date(iso)) : '';

export const plain = (v: string | number) => {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

export const amount = (v: string | number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));

/** "40K x 1 | 20K x 0 | LCL x 0", as on the office's invoices. */
export const containersText = (c: PrintHeader['containers']) => [`40K x ${c.HQ40}`, `20K x ${c.HQ20}`, `LCL x ${c.LCL}`];

/** A CLEARANCE line total as the office prints it: with its VAT. */
export const lineWithVat = (inv: Invoice, total: string) =>
  Number(total) + Math.round(Number(total) * Number(inv.vatRate)) / 100;

export function stampOf(inv: Invoice): { text: string; color: string } {
  if (inv.voidedAt) return { text: 'VOID', color: '#b91c1c' };
  if (inv.approvalStatus === 'APPROVED') return { text: 'APPROVED', color: '#15803d' };
  return { text: 'DRAFT', color: '#9ca3af' };
}

