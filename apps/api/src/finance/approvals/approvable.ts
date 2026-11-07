/**
 * Every financial document type and its table. A new document type (salaries,
 * custodies, invoices…) registers here and in financial_operations_v; the workflow
 * itself does not change (Open/Closed).
 */
export const APPROVABLE = {
  TRANSFER: { table: 'transfers', label: 'تحويل' },
  OTHER: { table: 'other_movements', label: 'حركة تانية' },
} as const;
export type ApprovableType = keyof typeof APPROVABLE;
export const APPROVABLE_TYPES = Object.keys(APPROVABLE) as ApprovableType[];
